import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";

export const C_LOCALE_ENV = {
  ...process.env,
  LC_ALL: "C",
  LANG: "C",
};

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  truncated: boolean;
}

export interface ProcessOptions {
  signal?: AbortSignal;
  allowNonZero?: boolean;
  captureStdout?: boolean;
  input?: string | Buffer;
  maxOutputBytes?: number;
  maxLines?: number;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export class ProcessExecutionError extends Error {
  readonly file: string;
  readonly args: readonly string[];
  readonly result: ProcessResult;

  constructor(
    file: string,
    args: readonly string[],
    result: ProcessResult,
  ) {
    super(`${file} exited with status ${result.exitCode ?? result.signal ?? "unknown"}`);
    this.name = "ProcessExecutionError";
    this.file = file;
    this.args = args;
    this.result = result;
  }
}

export class ProcessAbortedError extends Error {
  constructor() {
    super("Process was cancelled");
    this.name = "AbortError";
  }
}

export class ProcessTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Process timed out after ${timeoutMs} ms`);
    this.name = "ProcessTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/** Raised when a safety-relevant command produced more output than was read. */
export class ProcessOutputTruncatedError extends Error {
  readonly file: string;

  constructor(file: string) {
    super(`${file} produced more output than Depot can safely review`);
    this.name = "ProcessOutputTruncatedError";
    this.file = file;
  }
}

/** Rejects partial output where acting on an incomplete plan would be unsafe. */
export function requireCompleteOutput(
  file: string,
  result: ProcessResult,
): ProcessResult {
  if (result.truncated) throw new ProcessOutputTruncatedError(file);
  return result;
}

export function isProcessAborted(error: unknown): boolean {
  return error instanceof ProcessAbortedError ||
    (error instanceof Error && error.name === "AbortError");
}

export async function requireExecutable(path: string): Promise<void> {
  await access(path, constants.X_OK);
}

export function summarizeProcessOutput(
  output: string,
  maxLines = 8,
): string | undefined {
  const summary = output.trim().split(/\r?\n/).slice(-maxLines).join("\n");
  return summary || undefined;
}

export function runProcess(
  file: string,
  args: readonly string[],
  options: ProcessOptions = {},
): Promise<ProcessResult> {
  if (options.signal?.aborted) {
    return Promise.reject(new ProcessAbortedError());
  }

  return new Promise((resolve, reject) => {
    const child = spawn(file, [...args], {
      env: options.env,
      shell: false,
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });

    if (options.input !== undefined) {
      child.stdin?.end(options.input);
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const captureStdout = options.captureStdout ?? true;
    const maxOutputBytes = options.maxOutputBytes ?? 1024 * 1024;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let lineCount = 0;
    let truncated = false;
    let aborted = false;
    let timedOut = false;
    let stoppedForLimit = false;
    let killTimer: NodeJS.Timeout | undefined;
    let timeout: NodeJS.Timeout | undefined;

    const stopChild = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 500);
    };

    const abort = () => {
      aborted = true;
      stopChild();
    };

    options.signal?.addEventListener("abort", abort, { once: true });

    if (options.timeoutMs !== undefined) {
      timeout = setTimeout(() => {
        timedOut = true;
        stopChild();
      }, options.timeoutMs);
    }

    child.stdout!.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (captureStdout) stdoutChunks.push(chunk);
      lineCount += chunk.toString("utf8").split("\n").length - 1;

      if (!stoppedForLimit && (
        (captureStdout && stdoutBytes > maxOutputBytes) ||
        (options.maxLines !== undefined && lineCount >= options.maxLines)
      )) {
        truncated = true;
        stoppedForLimit = true;
        stopChild();
      }
    });

    child.stderr!.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= maxOutputBytes) stderrChunks.push(chunk);
      if (stderrBytes > maxOutputBytes) {
        truncated = true;
      }
    });

    child.once("error", (error) => {
      cleanup();
      reject(error);
    });

    child.once("close", (exitCode, processSignal) => {
      cleanup();

      if (aborted) {
        reject(new ProcessAbortedError());
        return;
      }

      if (timedOut) {
        reject(new ProcessTimeoutError(options.timeoutMs ?? 0));
        return;
      }

      const stdout = captureStdout ? Buffer.concat(stdoutChunks).toString("utf8") : "";
      const result: ProcessResult = {
        // A stopped child can leave a partial final line; never parse it.
        stdout: stoppedForLimit ? completeLines(stdout) : stdout,
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode,
        signal: processSignal,
        truncated,
      };

      if (!options.allowNonZero && !stoppedForLimit && exitCode !== 0) {
        reject(new ProcessExecutionError(file, args, result));
        return;
      }

      resolve(result);
    });

    function cleanup() {
      options.signal?.removeEventListener("abort", abort);
      if (timeout) clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
    }
  });
}

function completeLines(output: string): string {
  const lastNewline = output.lastIndexOf("\n");
  return lastNewline === -1 ? "" : output.slice(0, lastNewline + 1);
}
