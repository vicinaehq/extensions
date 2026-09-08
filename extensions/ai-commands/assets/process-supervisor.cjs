// The host owns the other end of the IPC channel. Its death closes the channel
// even after SIGKILL, when no cleanup code can run in the extension runtime.
const { spawn } = require("node:child_process");
const { constants } = require("node:os");

let child;
let stopping = false;
let timer;

function killGroup(signal) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

function finish(code) {
  clearTimeout(timer);
  killGroup("SIGKILL");
  process.exit(code);
}

function stop(signal) {
  if (signal === "SIGKILL") return finish(137);
  if (stopping) return;
  stopping = true;
  killGroup("SIGTERM");
  timer = setTimeout(() => finish(143), 1000);
}

process.on("disconnect", () => finish(137));
process.on("message", (message) => {
  if (message?.type === "stop")
    stop(message.signal === "SIGKILL" ? "SIGKILL" : "SIGTERM");
});
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGTERM"));
process.on("exit", () => killGroup("SIGKILL"));

if (!process.connected) process.exit(1);

child = spawn(process.argv[2], process.argv.slice(3), {
  detached: true,
  shell: false,
  // Inherit only the text transport. The CLI must not retain the IPC lifeline.
  stdio: [0, 1, 2],
});
child.on("error", (error) => {
  console.error(
    `Could not start the harness (${error.code ?? "spawn error"}).`,
  );
  finish(1);
});
child.on("exit", (code, signal) =>
  finish(code ?? 128 + (constants.signals[signal] ?? 1)),
);
