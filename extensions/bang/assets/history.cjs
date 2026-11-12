// Native history serialization for the terminal runner. Never evaluate history.
const fs = require("node:fs");
const path = require("node:path");

function serializeHistoryRecord(command, shell, timestamp) {
  if (shell === "bash") {
    // Bash reserves timestamp-looking lines as entry delimiters. Refuse to
    // save an ambiguous record rather than split it into runnable fragments.
    if (/^#\d+$/m.test(command)) throw new Error("Ambiguous Bash history record");
    return Buffer.from(`#${timestamp}\n${command}\n`, "utf8");
  }
  if (shell === "fish") {
    const escaped = command.replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
    return Buffer.from(`- cmd: ${escaped}\n  when: ${timestamp}\n`, "utf8");
  }
  if (shell !== "zsh") throw new Error("Unsupported history format");
  // Zsh stores embedded newlines with an added backslash, and pads a final
  // backslash (possibly followed by spaces) so it cannot continue the record.
  let escaped = command.replace(/\n/g, "\\\n");
  if (/\\ *$/.test(command)) escaped += " ";
  const raw = Buffer.from(`: ${timestamp}:0;${escaped}\n`, "utf8");
  const bytes = [];
  // Zsh zsh.h: imeta = NUL and the byte range Meta (0x83) .. Marker (0xa2).
  for (const byte of raw) {
    if (byte === 0 || byte >= 0x83 && byte <= 0xa2) bytes.push(0x83, byte ^ 32);
    else bytes.push(byte);
  }
  return Buffer.from(bytes);
}

function appendHistory(history, command, timestamp = Math.floor(Date.now() / 1000)) {
  if (!history || typeof history.path !== "string" || !path.isAbsolute(history.path)) throw new Error("Invalid history path");
  const record = serializeHistoryRecord(command, history.shell, timestamp);
  // Never truncate, rewrite, chmod an existing file, or follow a FIFO/device.
  // O_APPEND + one write avoids offset races between Bang's own appends.
  const fd = fs.openSync(history.path, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_APPEND | fs.constants.O_NONBLOCK | fs.constants.O_NOCTTY, 0o600);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error("History must be a regular file");
    if (stat.size) {
      const last = Buffer.alloc(1);
      if (fs.readSync(fd, last, 0, 1, stat.size - 1) !== 1 || last[0] !== 10) throw new Error("History has an unfinished record");
    }
    if (fs.writeSync(fd, record) !== record.length) throw new Error("Incomplete history write");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { appendHistory, serializeHistoryRecord };
