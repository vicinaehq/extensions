import { join } from "node:path";
import { runProcess, spawnHarness } from "../../src/harnesses/process";
import { RpcProcess } from "../../src/harnesses/rpc";
import { claudeModels } from "../../src/harnesses/claude";

const [mode, directory] = process.argv.slice(2) as [string, string];
const fixture = join(__dirname, "stubborn-cli.js");
process.env.AI_COMMANDS_TEST_PIDS = join(directory, "pids.json");

if (mode === "rpc") {
  new RpcProcess(process.execPath, [fixture], directory);
} else if (mode === "claude") {
  void claudeModels(fixture);
} else if (mode === "run") {
  void runProcess({
    executable: process.execPath,
    args: [fixture],
    cwd: directory,
  });
} else {
  spawnHarness(process.execPath, [fixture], { cwd: directory }).stdin.end();
}
