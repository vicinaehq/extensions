import { spawn } from "node:child_process";

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

export function isProcessAborted(error: unknown): boolean {
  return error instanceof ProcessAbortedError ||
    (error instanceof Error && error.name === "AbortError");
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
      stdio: ["ignore", "pipe", "pipe"],
    });

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

    child.stdout.on("data", (chunk: Buffer) => {
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

    child.stderr.on("data", (chunk: Buffer) => {
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

      const result: ProcessResult = {
        stdout: captureStdout ? Buffer.concat(stdoutChunks).toString("utf8") : "",
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
