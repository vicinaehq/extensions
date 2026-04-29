import { spawn, type SpawnOptions } from "node:child_process";
import { Mutex } from "../utils/mutex";
import { BwNotFound, CliInvocationError, classifyRbwStderr } from "./errors";

export interface RbwCliOptions {
  cliPath: string;
  serverCertsPath?: string;
  extraEnv?: NodeJS.ProcessEnv;
}

export interface RunOptions {
  stdin?: string;
  timeoutMs?: number;
}

const SHARED_MUTEX = new Mutex();

export class RbwCli {
  constructor(private opts: RbwCliOptions) {}

  /** Returns a new RbwCli instance with extra env merged in. */
  withEnv(extra: NodeJS.ProcessEnv): RbwCli {
    return new RbwCli({ ...this.opts, extraEnv: { ...this.opts.extraEnv, ...extra } });
  }

  /** Mutex-serialized text invocation. Use for state-changing rbw commands. */
  async text(args: string[], runOpts: RunOptions = {}): Promise<string> {
    const tQueued = Date.now();
    const tag = `[rbw-ext] ${args.join(" ")}`;
    return SHARED_MUTEX.run(() => {
      const wait = Date.now() - tQueued;
      if (wait > 5) console.log(`${tag} mutex-wait=${wait}ms`);
      return this.invoke(args, runOpts);
    });
  }

  async json<T>(args: string[], runOpts: RunOptions = {}): Promise<T | undefined> {
    const out = await this.text(args, runOpts);
    if (!out.trim()) return undefined;
    try {
      return JSON.parse(out) as T;
    } catch {
      throw new CliInvocationError("rbw produced invalid JSON output", 0);
    }
  }

  /** Read-only: bypasses the mutex. Use for `list`, `get`, `code`, `unlocked`, `config show`. */
  async readText(args: string[], runOpts: RunOptions = {}): Promise<string> {
    return this.invoke(args, runOpts);
  }

  async readJson<T>(args: string[], runOpts: RunOptions = {}): Promise<T | undefined> {
    const out = await this.readText(args, runOpts);
    if (!out.trim()) return undefined;
    try {
      return JSON.parse(out) as T;
    } catch {
      throw new CliInvocationError("rbw produced invalid JSON output", 0);
    }
  }

  /** Spawn rbw and return raw stdout + exitCode without throwing. Use for `unlocked`-style probes. */
  async tryReadText(args: string[], runOpts: RunOptions = {}): Promise<{stdout: string; exitCode: number}> {
    return this.invokeRaw(args, runOpts);
  }

  private async invoke(args: string[], runOpts: RunOptions): Promise<string> {
    const { stdout, exitCode } = await this.invokeRaw(args, runOpts);
    if (exitCode === 0) return stdout;
    throw classifyRbwStderr(this.lastStderr, exitCode);
  }

  // Holds stderr from the most recent invokeRaw. Mutex serialization makes this safe for `text`.
  private lastStderr = "";

  private invokeRaw(args: string[], runOpts: RunOptions): Promise<{stdout: string; exitCode: number}> {
    return new Promise((resolve, reject) => {
      const env: NodeJS.ProcessEnv = { ...process.env, ...this.opts.extraEnv };
      if (this.opts.serverCertsPath) env.SSL_CERT_FILE = this.opts.serverCertsPath;
      const tag = `[rbw-ext] ${args.join(" ")}`;
      const tSpawn = Date.now();
      const spawnOpts: SpawnOptions = { env, stdio: ["pipe", "pipe", "pipe"] };
      const proc = spawn(this.opts.cliPath, args, spawnOpts);
      console.log(`${tag} +0ms spawn`);

      let stdout = ""; let stderr = "";
      let firstStdoutAt: number | null = null;
      proc.stdout?.on("data", (d) => {
        if (firstStdoutAt === null) {
          firstStdoutAt = Date.now();
          console.log(`${tag} +${firstStdoutAt - tSpawn}ms first-stdout`);
        }
        stdout += d.toString();
      });
      proc.stderr?.on("data", (d) => (stderr += d.toString()));

      const timeout = runOpts.timeoutMs ? setTimeout(() => proc.kill("SIGKILL"), runOpts.timeoutMs) : null;
      let settled = false;
      const settle = (fn: () => void) => { if (settled) return; settled = true; if (timeout) clearTimeout(timeout); fn(); };

      proc.on("error", (err: NodeJS.ErrnoException) => {
        settle(() => err.code === "ENOENT"
          ? reject(new BwNotFound(`rbw not found at ${this.opts.cliPath}`))
          : reject(err));
      });

      proc.on("close", (code) => {
        settle(() => {
          console.log(`${tag} +${Date.now() - tSpawn}ms close code=${code} stdoutLen=${stdout.length}`);
          this.lastStderr = stderr;
          resolve({ stdout, exitCode: code ?? -1 });
        });
      });

      if (runOpts.stdin) { proc.stdin?.write(runOpts.stdin); proc.stdin?.end(); }
      else { proc.stdin?.end(); }
    });
  }
}
