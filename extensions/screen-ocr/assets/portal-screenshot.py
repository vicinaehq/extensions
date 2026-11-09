#!/usr/bin/env python3
"""Take a screenshot through the XDG desktop portal and print the file path.

This is the only sanctioned way for third-party apps to take screenshots on
GNOME Wayland. With --interactive, GNOME shows its own screenshot UI so the
user can pick an area; without it, the whole screen is captured (GNOME asks
for permission once).

Exit codes: 0 = success (path on stdout), 1 = cancelled, 2 = error.
"""

import secrets
import sys
from urllib.parse import unquote, urlparse

try:
    import gi

    gi.require_version("Gio", "2.0")
    from gi.repository import Gio, GLib
except Exception as exc:  # noqa: BLE001
    print(f"python3-gi is not available: {exc}", file=sys.stderr)
    sys.exit(2)

PORTAL_BUS = "org.freedesktop.portal.Desktop"
PORTAL_PATH = "/org/freedesktop/portal/desktop"
TIMEOUT_SECONDS = 180


def main() -> int:
    interactive = "--interactive" in sys.argv[1:]

    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    token = "vicinae_ocr_" + secrets.token_hex(8)
    sender = bus.get_unique_name().lstrip(":").replace(".", "_")
    request_path = f"{PORTAL_PATH}/request/{sender}/{token}"

    loop = GLib.MainLoop()
    result = {"code": 2, "uri": None}

    def on_response(_conn, _sender, _path, _iface, _signal, params):
        code, results = params.unpack()
        result["code"] = code
        result["uri"] = results.get("uri")
        loop.quit()

    # Subscribe before calling, so we cannot miss a fast response.
    bus.signal_subscribe(
        PORTAL_BUS,
        "org.freedesktop.portal.Request",
        "Response",
        request_path,
        None,
        Gio.DBusSignalFlags.NONE,
        on_response,
    )

    options = {
        "handle_token": GLib.Variant("s", token),
        "interactive": GLib.Variant("b", interactive),
        "modal": GLib.Variant("b", True),
    }
    try:
        bus.call_sync(
            PORTAL_BUS,
            PORTAL_PATH,
            "org.freedesktop.portal.Screenshot",
            "Screenshot",
            GLib.Variant("(sa{sv})", ("", options)),
            GLib.VariantType("(o)"),
            Gio.DBusCallFlags.NONE,
            -1,
            None,
        )
    except GLib.Error as exc:
        print(f"Screenshot portal call failed: {exc.message}", file=sys.stderr)
        return 2

    def on_timeout():
        print("Timed out waiting for the screenshot portal", file=sys.stderr)
        loop.quit()
        return False

    GLib.timeout_add_seconds(TIMEOUT_SECONDS, on_timeout)
    loop.run()

    # Response codes: 0 = success, 1 = cancelled by user, 2 = other error.
    if result["code"] == 1:
        return 1
    if result["code"] != 0 or not result["uri"]:
        print("Screenshot portal returned no image", file=sys.stderr)
        return 2

    print(unquote(urlparse(result["uri"]).path))
    return 0


if __name__ == "__main__":
    sys.exit(main())
