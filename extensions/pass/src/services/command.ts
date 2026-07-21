import { execFile } from "child_process";
import os from "os";
import path from "path";
import { Preferences } from "@/preferences";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_BUFFER_BYTES = 1024 * 1024;

type RunCommandOptions = {
  input?: string;
  timeoutMs?: number;
};

export class CommandError extends Error {
  constructor(
    message: string,
    public readonly code?: string | number,
    public readonly stderr?: string,
    public readonly signal?: NodeJS.Signals,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

export async function runCommand(
  command: string,
  args: string[],
  preferences: Preferences,
  options: RunCommandOptions = {},
): Promise<string> {
  const env = buildEnv(preferences.additionalPath);

  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      {
        env,
        maxBuffer: MAX_BUFFER_BYTES,
        encoding: "utf-8",
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const stderrText = bufferToString(stderr);
        if (error) {
          reject(toCommandError(command, error, stderrText, env.PATH));
          return;
        }
        resolve(bufferToString(stdout));
      },
    );

    child.stdin?.on("error", () => undefined);
    if (options.input === undefined) {
      child.stdin?.end();
    } else {
      child.stdin?.end(options.input);
    }
  });
}

function toCommandError(
  command: string,
  error: Error & NodeJS.ErrnoException & { killed?: boolean; signal?: NodeJS.Signals },
  stderr?: string,
  effectivePath?: string,
): CommandError {
  let details = stderr?.trim() || error.message || String(error.code ?? "unknown error");

  if (error.code === "ENOENT") {
    details = `command not found in PATH. Set Additional PATH Entries in preferences if needed. Effective PATH: ${effectivePath || "(empty)"}`;
  } else if (error.killed || error.signal) {
    details = `timed out or was interrupted (${error.signal ?? "no signal"})`;
  }

  return new CommandError(
    `Failed to run ${command}: ${details}`,
    error.code,
    stderr,
    error.signal,
  );
}

function buildEnv(additionalPath?: string): NodeJS.ProcessEnv {
  const user = process.env.USER || os.userInfo().username;
  const home = os.homedir();
  const platformDefaults = process.platform === "darwin"
    ? [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/opt/local/bin",
        "/usr/local/MacGPG2/bin",
      ]
    : ["/usr/local/bin"];
  const profileDefaults = [
    path.join(home, ".nix-profile", "bin"),
    `/etc/profiles/per-user/${user}/bin`,
    "/nix/var/nix/profiles/default/bin",
    "/run/current-system/sw/bin",
  ];
  const systemDefaults = ["/usr/bin", "/bin", "/usr/sbin", "/sbin"];
  const pathEntries = [
    ...splitPath(additionalPath),
    ...platformDefaults,
    ...profileDefaults,
    ...splitPath(process.env.PATH),
    ...systemDefaults,
  ];
  const updatedPath = Array.from(new Set(pathEntries)).join(":");

  return {
    ...process.env,
    PATH: updatedPath,
  };
}

function splitPath(value?: string): string[] {
  return value
    ?.split(":")
    .map((entry) => expandHome(entry.trim()))
    .filter(Boolean) ?? [];
}

function expandHome(entry: string): string {
  if (entry === "~") return os.homedir();
  if (entry.startsWith("~/")) return path.join(os.homedir(), entry.slice(2));
  return entry;
}

function bufferToString(value: string | Buffer): string {
  return typeof value === "string" ? value : value.toString("utf-8");
}
