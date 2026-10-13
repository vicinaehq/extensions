const { spawn } = require("node:child_process");
const { writeFileSync, renameSync } = require("node:fs");

// No provider code or network access. Both processes deliberately ignore TERM.
process.on("SIGTERM", () => {});
const descendant = spawn(
  process.execPath,
  [
    "-e",
    'process.on("SIGTERM", () => {}); process.send("ready"); setInterval(() => {}, 1000);',
  ],
  { stdio: ["ignore", "ignore", "ignore", "ipc"] },
);
descendant.once("message", () => {
  writeFileSync(
    process.env.AI_COMMANDS_TEST_PIDS + ".tmp",
    JSON.stringify({
      supervisor: process.ppid,
      cli: process.pid,
      descendant: descendant.pid,
    }),
  );
  renameSync(
    process.env.AI_COMMANDS_TEST_PIDS + ".tmp",
    process.env.AI_COMMANDS_TEST_PIDS,
  );
  if (process.env.AI_COMMANDS_TEST_EXIT) process.exit(0);
});
setInterval(() => {}, 1000);
