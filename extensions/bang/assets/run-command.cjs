// Terminal-side one-shot runner. Keep auditable: never log payloads or raw errors.
// The extension sends a command only after an explicit Run action (with optional confirmation).
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");
const tty = require("node:tty");
const { spawnSync } = require("node:child_process");
const { appendHistory } = require("./history.cjs");

function fail() {
  process.stderr.write("Bang could not start the command. Check shell and directory preferences, then retry from Bang.\n");
  process.exitCode = 1;
}

function waitForApproval() {
  let fd;
  let owned = false;
  try {
    // Use the controlling terminal even if a command consumed/closed stdin.
    try { fd = fs.openSync("/dev/tty", "r+"); owned = true; }
    catch { if (tty.isatty(0)) fd = 0; else throw new Error("No terminal"); }
    fs.writeSync(owned ? fd : 2, `\nBang: command finished (exit ${process.exitCode ?? 0}). Press Enter to close this terminal.\n`);
    const byte = Buffer.alloc(1);
    while (fs.readSync(fd, byte, 0, 1, null)) {
      if (byte[0] === 10 || byte[0] === 13) break;
    }
  } catch {
    process.stderr.write("Bang cannot wait for approval because no readable terminal is attached.\n");
  } finally {
    if (owned) fs.closeSync(fd);
  }
}

const socketPath = process.argv[2];
if (!socketPath || !path.isAbsolute(socketPath)) {
  fail();
  waitForApproval();
} else {
  const socket = net.createConnection(socketPath);
  const chunks = [];
  let size = 0;
  let failed = false;
  socket.setTimeout(30000, () => socket.destroy(new Error("Timed out")));
  socket.on("error", () => { failed = true; fail(); waitForApproval(); });
  socket.on("data", chunk => {
    size += chunk.length;
    if (size > 512 * 1024) socket.destroy(new Error("Oversized payload"));
    else chunks.push(chunk);
  });
  socket.on("end", () => {
    if (failed) return;
    socket.destroy();
    let shouldWait = true;
    try {
      const { shellPath, workingDirectory, command, waitForApproval: wait, history } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (typeof wait !== "boolean") throw new Error("Invalid wait setting");
      shouldWait = wait;
      if (typeof command !== "string" || typeof shellPath !== "string" || typeof workingDirectory !== "string" ||
          !path.isAbsolute(shellPath) || !path.isAbsolute(workingDirectory) || !command.trim() ||
          Buffer.byteLength(command) > 65536 || /[\x00-\x08\x0b-\x1f\x7f-\x9f\ufffd\u202a-\u202e\u2066-\u2069]/.test(command) ||
          (history !== undefined && (!history || typeof history.path !== "string" || !path.isAbsolute(history.path) || !["bash", "zsh", "fish"].includes(history.shell)))) {
        fail();
        return;
      }
      // This shell is the ONLY interpreter. No outer shell or interpolated wrapper.
      // Inherit terminal stdin as well as output, so read/sudo/TUI programs work.
      const timestamp = Math.floor(Date.now() / 1000);
      const child = spawnSync(shellPath, ["-c", command], {
        cwd: workingDirectory, stdio: "inherit", shell: false,
      });
      if (child.error) fail();
      else {
        process.exitCode = child.status ?? 1;
        if (history) {
          try { appendHistory(history, command, timestamp); }
          catch { process.stderr.write("Bang could not save this command to history. Check History Path, permissions, and unfinished records. Your command was not rerun.\n"); }
        }
      }
    } catch {
      fail();
    } finally {
      if (shouldWait) waitForApproval();
    }
  });
}
