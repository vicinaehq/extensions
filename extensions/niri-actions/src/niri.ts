import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export type NiriWorkspace = {
  id: number;
  idx: number;
  name: string | null;
  output: string;
  is_active: boolean;
  is_focused: boolean;
};

export type NiriOutput = {
  name: string;
  make: string;
  model: string;
  logical?: { x: number; y: number; width: number; height: number };
};

export type NiriWindow = {
  id: number;
  title: string | null;
  app_id: string | null;
  workspace_id: number | null;
  is_focused: boolean;
};

async function niriJson<T>(args: string[]): Promise<T> {
  const { stdout } = await execFile("niri", ["msg", "--json", ...args]);
  return JSON.parse(stdout) as T;
}

export const queryWorkspaces = () => niriJson<NiriWorkspace[]>(["workspaces"]);

export const queryWindows = () => niriJson<NiriWindow[]>(["windows"]);

export async function queryOutputs(): Promise<NiriOutput[]> {
  const byName = await niriJson<Record<string, NiriOutput>>(["outputs"]);
  return Object.values(byName);
}

export type NiriCommandResult = {
  ok: boolean;
  /** Combined stderr/stdout trimmed message on failure */
  error?: string;
};

/**
 * Run `niri msg action <name> [...args]` without a shell.
 * Argument values only ever become separate argv entries, never shell syntax.
 */
export async function runNiriAction(name: string, args: string[] = []): Promise<NiriCommandResult> {
  try {
    await execFile("niri", ["msg", "action", name, ...args]);
    return { ok: true };
  } catch (error) {
    let message = "Unknown error";
    if (error instanceof Error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        message = "The niri executable was not found in PATH";
      } else {
        const stderr = (error as { stderr?: string }).stderr;
        const stdout = (error as { stdout?: string }).stdout;
        message = [stderr, stdout].filter(Boolean).join(" ").trim() || error.message;
      }
    }
    return { ok: false, error: message };
  }
}
