import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
export type ServiceRunner = (args: string[]) => Promise<string>;
const runSystemctl: ServiceRunner = async (args) =>
  (await execute("systemctl", args, { timeout: 5000, maxBuffer: 64_000 }))
    .stdout;

export function serviceUsesLauncher(output: string, launcher: string): boolean {
  const lines = output.split("\n");
  if (!lines.includes("ActiveState=active")) return false;
  const start = lines.find((line) => line.startsWith("ExecStart="));
  const match = start?.match(/^ExecStart=\{ path=(.*?) ; argv\[\]=(.*?) ;/);
  return (
    match?.[1] === launcher &&
    (match[2] === `${launcher} server` ||
      match[2] === `${launcher} server --replace`)
  );
}

export async function canRestartLauncher(
  launcher: string,
  run = runSystemctl,
): Promise<boolean> {
  try {
    return serviceUsesLauncher(
      await run([
        "--user",
        "show",
        "vicinae.service",
        "--property=ActiveState",
        "--property=ExecStart",
      ]),
      launcher,
    );
  } catch {
    return false;
  }
}

export async function restartLauncher(
  launcher: string,
  run = runSystemctl,
): Promise<void> {
  if (!(await canRestartLauncher(launcher, run)))
    throw new Error(
      "Vicinae is not running through the configured user service. Quit and reopen it through your usual launcher, then return to Setup AI Commands.",
    );
  // Queue the restart before Vicinae terminates this extension runtime.
  await run(["--user", "--no-block", "restart", "vicinae.service"]);
}
