import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type WhisrsPrefs = {
  binaryPath?: string;
  historyLimit?: string;
};

export function resolveBinary(prefs: WhisrsPrefs): string {
  const p = prefs.binaryPath?.trim();
  return p && p.length > 0 ? p : "whisrs";
}

export class WhisrsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhisrsError";
  }
}

export type ExecResult = {
  stdout: string;
  stderr: string;
  code: number | null;
};

async function run(
  binary: string,
  args: string[],
  opts: { allowFailure?: boolean } = {},
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(binary, args, {
      maxBuffer: 1024 * 1024 * 16,
    });
    return { stdout, stderr, code: 0 };
  } catch (err: any) {
    const result: ExecResult = {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      code: typeof err.code === "number" ? err.code : null,
    };
    if (opts.allowFailure) return result;
    const detail =
      result.stderr.trim() || result.stdout.trim() || err.message || "unknown error";
    if (err.code === "ENOENT") {
      throw new WhisrsError(
        `whisrs executable not found at "${binary}". Install whisrs (https://github.com/y0sif/whisrs) and set the "Whisrs Binary Path" preference if it is not on your PATH.`,
      );
    }
    throw new WhisrsError(detail);
  }
}

async function silent(binary: string, args: string[]): Promise<void> {
  await run(binary, args);
}

export async function whisrsStatus(prefs: WhisrsPrefs): Promise<string> {
  const res = await run(resolveBinary(prefs), ["status"]);
  return (res.stdout || res.stderr).trim();
}

export async function whisrsLog(prefs: WhisrsPrefs, limit = 10): Promise<string[]> {
  const res = await run(resolveBinary(prefs), ["log", "-n", String(limit)]);
  const text = (res.stdout || res.stderr).trim();
  if (!text) return [];
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0);
}

export async function whisrsToggle(prefs: WhisrsPrefs): Promise<void> {
  await silent(resolveBinary(prefs), ["toggle"]);
}

export async function whisrsCancel(prefs: WhisrsPrefs): Promise<void> {
  await silent(resolveBinary(prefs), ["cancel"]);
}

export async function whisrsSpeak(prefs: WhisrsPrefs): Promise<void> {
  await silent(resolveBinary(prefs), ["speak"]);
}

export async function whisrsRestart(prefs: WhisrsPrefs): Promise<void> {
  await silent(resolveBinary(prefs), ["restart"]);
}

export function whisrsSetupCommand(prefs: WhisrsPrefs): string[] {
  return [resolveBinary(prefs), "setup"];
}
