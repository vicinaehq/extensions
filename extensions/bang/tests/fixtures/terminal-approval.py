"""Isolated PTY test; never sends keys to the user's desktop or global input."""
import fcntl
import json
import os
import pty
import select
import subprocess
import sys
import termios
import time

node, runner, socket, expected_status = sys.argv[1:]
master, slave = pty.openpty()


def attach_terminal():
    os.setsid()
    fcntl.ioctl(0, termios.TIOCSCTTY, 0)


child = subprocess.Popen(
    [node, runner, socket], stdin=slave, stdout=slave, stderr=slave,
    preexec_fn=attach_terminal,
)
os.close(slave)
try:
    output = b""
    deadline = time.monotonic() + 5
    while b"Press Enter to close this terminal." not in output:
        assert child.poll() is None, "Runner closed before approval"
        assert time.monotonic() < deadline, "Missing approval prompt"
        if select.select([master], [], [], 0.1)[0]:
            output += os.read(master, 65536)
    time.sleep(0.2)
    assert child.poll() is None, "Fast command closed the terminal automatically"
    os.write(master, b"\n")
    assert child.wait(timeout=5) == int(expected_status), "Exit status changed"
    print(json.dumps({"waited_for_approval": True, "exit_status": child.returncode}))
finally:
    if child.poll() is None:
        child.kill()
        child.wait()
    os.close(master)
