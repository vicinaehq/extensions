import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import type { CliId } from "../core/types";
import { withoutPrivateLauncher } from "../core/launcher-paths";

export function cleanEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...withoutPrivateLauncher(process.env),
    NO_COLOR: "1",
    TERM: "dumb",
  };
  // Keep the CLIs' own saved login. Do not silently select metered API credentials
  // or inherit the parent Codex/Claude session identity.
  for (const key of Object.keys(env)) {
    if (
      /^(ANTHROPIC_|OPENAI_API_KEY$|CODEX_API_KEY$|XAI_API_KEY$|GROK_API_KEY$|CLAUDECODE$|CLAUDE_CODE_(SESSION|ENTRYPOINT|OAUTH_TOKEN|USE_|EFFORT|SUBAGENT)|CODEX_(THREAD|TURN|INTERNAL|MANAGED|APP_SERVER|SANDBOX)|MCP_)/.test(
        key,
      )
    )
      delete env[key];
  }
  return env;
}

export async function resolveExecutable(
  harness: CliId | "vicinae",
  override?: string,
): Promise<string> {
  const candidates = override?.trim()
    ? [override.trim().replace(/^~\//, `${homedir()}/`)]
    : [
        join(homedir(), ".local", "bin", harness),
        ...(harness === "grok"
          ? [join(homedir(), ".grok", "bin", "grok")]
          : []),
        ...(harness === "opencode"
          ? [join(homedir(), ".opencode", "bin", "opencode")]
          : []),
        ...(process.env.PATH ?? "")
          .split(delimiter)
          .filter((part) => isAbsolute(part))
          .map((part) => join(part, harness)),
        join("/usr/local/bin", harness),
        join("/usr/bin", harness),
      ];
  if (override?.trim() && !isAbsolute(candidates[0]!))
    throw new Error(
      "The executable path must be absolute, for example /home/you/.local/bin/claude.",
    );
  for (const candidate of [...new Set(candidates)]) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      /* Try the next install location. */
    }
  }
  throw new Error(
    `${harness} is not installed or is not executable. Install its official CLI, then set its path in extension preferences if needed.`,
  );
}

export async function inTemporaryDirectory<T>(
  callback: (cwd: string) => Promise<T>,
): Promise<T> {
  const cwd = await mkdtemp(join(tmpdir(), "vicinae-ai-"));
  try {
    return await callback(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

export function terminateProcess(
  child: ChildProcessWithoutNullStreams,
  signal: NodeJS.Signals = "SIGTERM",
): void {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    /* The process may already have exited. */
  }
}

export interface ProcessOptions {
  executable: string;
  args: string[];
  cwd: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  input?: string;
  onLine?: (line: string) => void;
  env?: NodeJS.ProcessEnv;
}

export async function runProcess(
  options: ProcessOptions,
): Promise<{ stdout: string; stderr: string }> {
  options.signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(options.executable, options.args, {
      cwd: options.cwd,
      env: options.env ?? cleanEnvironment(),
      shell: false,
      detached: process.platform !== "win32",
      stdio: "pipe",
    });
    let stdout = "";
    let stderr = "";
    let buffer = "";
    let failure: Error | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const fail = (error: Error) => {
      if (failure || settled) return;
      failure = error;
      terminateProcess(child);
      killTimer = setTimeout(() => terminateProcess(child, "SIGKILL"), 1000);
      killTimer.unref();
    };
    const abort = () => fail(new Error("Generation cancelled."));
    const timer = setTimeout(
      () =>
        fail(
          new Error(
            "The harness timed out. Check its login and connection, then try again.",
          ),
        ),
      options.timeoutMs ?? 180_000,
    );
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer) {
        // The leader can exit before descendants that ignored SIGTERM.
        // Finish killing the owned process group before cancelling escalation.
        terminateProcess(child, "SIGKILL");
        clearTimeout(killTimer);
      }
      options.signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve({ stdout, stderr });
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 4_000_000) {
        fail(new Error("The harness returned too much output."));
        return;
      }
      if (!options.onLine) return;
      buffer += chunk;
      let end: number;
      while ((end = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        try {
          if (line.trim()) options.onLine(line);
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-8_000);
    });
    child.on("error", (error) => finish(error));
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") fail(error);
    });
    child.on("close", (code, signal) => {
      if (!failure && buffer.trim() && options.onLine) {
        try {
          options.onLine(buffer);
        } catch (error) {
          failure = error instanceof Error ? error : new Error(String(error));
        }
      }
      finish(
        failure ??
          (code === 0
            ? undefined
            : new Error(
                stderr.trim().slice(-1500) ||
                  `Harness exited ${signal ?? code}. Check its login in a terminal.`,
              )),
      );
    });
    child.stdin.end(options.input ?? "");
  });
}

export function parseJsonLine(line: string): Record<string, any> {
  try {
    const value: unknown = JSON.parse(line);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value as Record<string, any>;
  } catch {
    throw new Error(
      "The harness returned an unexpected output format. Update its CLI and try again.",
    );
  }
}
