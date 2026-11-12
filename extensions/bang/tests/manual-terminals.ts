/** Opt-in desktop smoke test: launches VISIBLE terminals with synthetic commands only. */
import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createHandoff } from "../src/lib/handoff";
import { terminalRequest } from "../src/lib/execution";

const exec = promisify(execFile);
async function main() {
  const waitForApproval = process.argv.includes("--approval");
  const directory = await mkdtemp(path.join(tmpdir(), "bang-terminal-smoke-"));
  const runner = { executable: process.execPath, script: fileURLToPath(new URL("../assets/run-command.cjs", import.meta.url)) };
  const terminals = [
    { name: "xdg-terminal-exec", prefix: [] },
    { name: "gnome-terminal", prefix: ["--"] },
    { name: "konsole", prefix: ["-e"] },
    { name: "kitty", prefix: ["--"] },
    { name: "foot", prefix: [] },
    { name: "alacritty", prefix: ["-e"] },
  ];
  try {
    for (const terminal of terminals) {
      try { execFileSync("which", [terminal.name], { stdio: "ignore" }); }
      catch { console.log(`SKIP ${terminal.name}: not installed`); continue; }
      const marker = `${terminal.name}.txt`;
      const handoff = await createHandoff({
        shellPath: "/bin/bash", workingDirectory: directory, waitForApproval,
        history: { path: path.join(directory, `${terminal.name}.history`), shell: "bash" },
        command: `printf '%s\\n' 'Bang visible terminal smoke test' | cat > ${marker}\nprintf '%s\\n' 'Bang test command completed.'`,
      });
      try {
        const request = terminalRequest(handoff.socketPath, runner);
        if (waitForApproval) console.log(`Check ${terminal.name}: after the command exits, press Enter in its terminal to approve closing.`);
        await exec(terminal.name, [...terminal.prefix, ...request.args], { timeout: waitForApproval ? 300000 : 15000 });
        let result = "";
        let savedHistory = "";
        for (let attempt = 0; attempt < 100; attempt++) {
          try { result = await readFile(path.join(directory, marker), "utf8"); } catch { /* terminal startup */ }
          try { savedHistory = await readFile(path.join(directory, `${terminal.name}.history`), "utf8"); } catch { /* command still running */ }
          if (result && savedHistory) break;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (result !== "Bang visible terminal smoke test\n") throw new Error("No marker from terminal");
        if (!savedHistory.includes("Bang visible terminal smoke test")) throw new Error("No saved history");
        console.log(`PASS ${terminal.name}: runner, IPC, cwd, pipe, redirection and history saving`);
      } catch {
        console.log(`FAIL ${terminal.name}: check desktop session and terminal configuration`);
        process.exitCode = 1;
      } finally { await handoff.dispose(); }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
}
void main();
