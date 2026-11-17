import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import type { Settings } from "./paths";
import { commandProblem } from "./privacy";
import type { CommandPayload, Handoff } from "./handoff";

export type Runner = { executable: string; script: string };
export type TerminalRequest = { args: string[]; options: { hold: boolean; title: string } };

/** Vicinae logs terminal argv. Only a runner and private socket path go in argv. */
export function terminalRequest(socketPath: string, runner: Runner): TerminalRequest {
  // The runner waits for approval itself. An emulator hold flag would cause a
  // second wait (or an uncloseable window) after the user has already approved.
  return { args: [runner.executable, runner.script, socketPath], options: { hold: false, title: "Bang" } };
}

export type ExecutionPorts = {
  confirm: () => Promise<boolean>;
  launch: (args: string[], options: TerminalRequest["options"]) => Promise<unknown>;
  prepare: (payload: CommandPayload) => Promise<Handoff>;
  runner: Runner;
  preflight?: () => Promise<void>;
};

/** Call only from an explicit Run action; confirmation is an independent opt-out. */
export async function executeCommand(command: string, settings: Settings, ports: ExecutionPorts): Promise<boolean> {
  const problem = commandProblem(command);
  if (problem) throw new Error(problem);
  if (settings.confirmBeforeRun && !await ports.confirm()) return false;
  if (ports.preflight) await ports.preflight();
  const handoff = await ports.prepare({
    command, shellPath: settings.shellPath, workingDirectory: settings.workingDirectory,
    waitForApproval: settings.hold,
    ...(settings.saveHistory ? { history: { path: settings.historyPath, shell: settings.shell } } : {}),
  });
  try {
    const request = terminalRequest(handoff.socketPath, ports.runner);
    await ports.launch(request.args, request.options);
  } catch (error) {
    await handoff.dispose();
    throw error;
  }
  return true;
}

export async function preflightExecution(settings: Settings): Promise<void> {
  await access(settings.shellPath, constants.X_OK);
  if (!(await stat(settings.shellPath)).isFile()) throw new Error("Invalid shell executable");
  await access(settings.workingDirectory, constants.X_OK);
  if (!(await stat(settings.workingDirectory)).isDirectory()) throw new Error("Invalid working directory");
}
