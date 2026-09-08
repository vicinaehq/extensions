import type { ChildProcessWithoutNullStreams } from "node:child_process";
import {
  cleanEnvironment,
  parseJsonLine,
  spawnHarness,
  terminateProcess,
} from "./process";

type Pending = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class RpcProcess {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private buffer = "";
  private stderr = "";
  private failure?: Error;
  private readonly closed: Promise<void>;
  onNotification?: (method: string, params: any) => void;

  constructor(
    executable: string,
    args: string[],
    cwd: string,
    private readonly signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    this.child = spawnHarness(executable, args, {
      cwd,
      env: cleanEnvironment(),
    });
    this.closed = new Promise((resolve) => this.child.once("close", resolve));
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-1500);
    });
    this.child.stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      if (this.buffer.length > 4_000_000) {
        this.fail(new Error("Harness protocol response is too large."));
        return;
      }
      let end: number;
      while ((end = this.buffer.indexOf("\n")) !== -1) {
        const line = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 1);
        if (!line.trim()) continue;
        try {
          const message = parseJsonLine(line);
          if (message.method && message.id !== undefined) {
            // Model discovery never grants filesystem, terminal, or tool access.
            this.send({
              jsonrpc: "2.0",
              id: message.id,
              error: {
                code: -32601,
                message: "This client does not provide tools or permissions.",
              },
            });
          } else if (message.method)
            this.onNotification?.(message.method, message.params);
          else {
            const pending = this.pending.get(message.id);
            if (!pending) continue;
            clearTimeout(pending.timer);
            this.pending.delete(message.id);
            if (message.error)
              pending.reject(
                new Error(message.error.message ?? "Harness request failed."),
              );
            else pending.resolve(message.result);
          }
        } catch (error) {
          this.fail(error instanceof Error ? error : new Error(String(error)));
        }
      }
    });
    this.child.on("error", (error) => this.fail(error));
    this.child.stdin.on("error", (error) => this.fail(error));
    this.child.on("close", () =>
      this.fail(
        new Error(this.stderr.trim() || "Harness closed before responding."),
      ),
    );
    signal?.addEventListener("abort", this.abort, { once: true });
    if (signal?.aborted) this.abort();
  }

  private readonly abort = () => this.fail(new Error("Operation cancelled."));

  private send(message: unknown): void {
    if (this.failure) throw this.failure;
    this.child.stdin.write(JSON.stringify(message) + "\n");
  }

  notify(method: string, params?: unknown): void {
    this.send({
      jsonrpc: "2.0",
      method,
      ...(params === undefined ? {} : { params }),
    });
  }

  request<T = any>(
    method: string,
    params: unknown,
    timeoutMs = 25_000,
  ): Promise<T> {
    if (this.failure) return Promise.reject(this.failure);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.fail(
            new Error(
              `${method} timed out. Check the CLI's login and connection.`,
            ),
          ),
        timeoutMs,
      );
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    terminateProcess(this.child);
  }

  async close(): Promise<void> {
    this.signal?.removeEventListener("abort", this.abort);
    this.fail(new Error("Harness connection closed."));
    this.child.stdin.end();
    const timer = setTimeout(
      () => terminateProcess(this.child, "SIGKILL"),
      1000,
    );
    try {
      await this.closed;
    } finally {
      terminateProcess(this.child, "SIGKILL");
      clearTimeout(timer);
    }
  }
}
