"""Opt-in KDE integration test using a disposable Qt window.

Requires system Python with PySide6, dbus-python and PyGObject, plus kdotool.
The Vicinae host API is mocked; KWin, D-Bus and command execution are real.
"""

import json
import math
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time

import dbus
import dbus.service
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib

ROOT = Path(__file__).resolve().parent.parent
SERVICE = f"org.vicinae.LayoutTest.p{os.getpid()}"


def run(*args):
    return subprocess.check_output(args, text=True, cwd=ROOT, timeout=15).strip()


def kwin(method, *args, path="/Scripting", interface="org.kde.kwin.Scripting"):
    return run("gdbus", "call", "--session", "--dest", "org.kde.KWin",
               "--object-path", path, "--method", f"{interface}.{method}", *args)


DBusGMainLoop(set_as_default=True)
bus = dbus.SessionBus()
bus_name = dbus.service.BusName(SERVICE, bus)


class Collector(dbus.service.Object):
    value = None
    loop = None

    @dbus.service.method("org.vicinae.LayoutTest", in_signature="s", out_signature="")
    def report(self, value):
        self.value = json.loads(str(value))
        self.loop.quit()


collector = Collector(bus_name, "/Result")


def query(body):
    collector.value = None
    collector.loop = GLib.MainLoop()
    name = f"layout-test-{os.getpid()}-{time.monotonic_ns()}"
    with tempfile.TemporaryDirectory(prefix="layout-query-") as directory:
        script = Path(directory) / "query.js"
        script.write_text(
            'callDBus(' + json.dumps(SERVICE)
            + ', "/Result", "org.vicinae.LayoutTest", "report", '
            + 'JSON.stringify((function() {' + body + '})()));'
        )
        number = re.search(r"\((-?\d+),?\)", kwin("loadScript", str(script), name))[1]
        assert int(number) >= 0
        timer = None
        try:
            kwin("run", path=f"/Scripting/Script{number}", interface="org.kde.kwin.Script")
            timer = GLib.timeout_add(3000, lambda: (collector.loop.quit(), False)[1])
            collector.loop.run()
            assert collector.value is not None, "KWin query timed out"
            return collector.value
        finally:
            if timer:
                GLib.source_remove(timer)
            kwin("unloadScript", name)


def snapshot(target):
    return query('const w = workspace.stackingOrder.find(w => String(w.internalId) === '
                 + json.dumps(target) + '); if (!w) return {missing:true};'
                 + 'return {geometry:w.frameGeometry, area:workspace.clientArea(KWin.MaximizeArea,w),'
                 + 'fullScreen:w.fullScreen, active:String(workspace.activeWindow.internalId)};')


def apply(layout, target, mode="api"):
    return json.loads(run("node", "tests/run-command.cjs", layout, target, mode))["messages"]


if os.environ.get("XDG_SESSION_TYPE") != "wayland":
    raise SystemExit("Run this test in a KDE Plasma Wayland session.")

previous = run("kdotool", "getactivewindow", "getwindowid")
title = f"KWin Window Layouts disposable test {os.getpid()}"
window = subprocess.Popen([
    "/usr/bin/python3", "-c",
    "from PySide6.QtWidgets import QApplication,QWidget; "
    "from PySide6.QtCore import QTimer; "
    "app=QApplication([]); w=QWidget(); w.setWindowTitle(" + repr(title) + "); "
    "w.resize(640,480); w.show(); QTimer.singleShot(180000,app.quit); app.exec()",
], env={**os.environ, "QT_QPA_PLATFORM": "wayland"})

try:
    target = ""
    for _ in range(30):
        target = run("kdotool", "search", "--title", "^" + re.escape(title) + "$", "getwindowid")
        if target:
            break
        time.sleep(0.1)
    assert re.fullmatch(r"\{[a-fA-F0-9-]{36}\}", target), "Disposable window not found"
    run("kdotool", "windowactivate", target)
    layouts = json.loads(run("node", "-e",
        'const {root,loadSource}=require("./tests/helpers.cjs"); '
        'console.log(JSON.stringify(loadSource(root+"/src/layouts.ts").layouts))'))
    initial = snapshot(target)
    print("Usable area:", json.dumps(initial["area"]), flush=True)
    for name, layout in layouts.items():
        assert apply(name, target) == [], name
        time.sleep(0.12)
        state = snapshot(target)
        a = initial["area"]
        # Independent edge calculations, matching JavaScript rounding for negatives.
        edges = [math.floor(start + length * n / d + 0.5) for start, length, n, d in [
            (a["x"], a["width"], layout[0], layout[1]),
            (a["x"], a["width"], layout[2], layout[3]),
            (a["y"], a["height"], layout[4], layout[5]),
            (a["y"], a["height"], layout[6], layout[7]),
        ]]
        expected = dict(x=edges[0], y=edges[2], width=edges[1]-edges[0], height=edges[3]-edges[2])
        # Wayland clients quantize sizes to physical pixels at fractional scale.
        assert all(abs(state["geometry"][key] - value) <= 1 for key, value in expected.items()), (name, expected, state)
        assert state["active"] == target, name
    print(f"PASS: {len(layouts)} layouts, geometry and focus", flush=True)

    for property in ["MAXIMIZED", "FULLSCREEN"]:
        run("kdotool", "windowstate", "--add", property, target)
        time.sleep(0.2)
        assert apply("middle-center-sixth", target) == []
        time.sleep(0.2)
        state = snapshot(target)
        assert not state["fullScreen"], state
        assert state["geometry"]["width"] < initial["area"]["width"]
        assert state["geometry"]["height"] < initial["area"]["height"]
        print(f"PASS: resize from {property}", flush=True)

    run("kdotool", "windowactivate", target)
    assert apply("left-half", target, "fallback") == []
    print("PASS: real kdotool fallback", flush=True)
    missing = "{00000000-0000-0000-0000-000000000000}"
    assert "KWin could not apply" in apply("left-half", missing)[0]
    print("PASS: missing window error reported", flush=True)
finally:
    window.terminate()
    window.wait(timeout=5)
    if re.fullmatch(r"\{[a-fA-F0-9-]{36}\}", previous):
        run("kdotool", "windowactivate", previous)
