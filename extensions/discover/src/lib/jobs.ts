import { spawn } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  openSync,
  readSync,
  fstatSync,
  closeSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { binary } from "./system";
import type { Job, Plan } from "./types";

export function listJobs(root: string): Job[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((x) => /^[0-9a-f-]{36}$/.test(x))
    .flatMap((id) => {
      try {
        const job = JSON.parse(readFileSync(join(root, id, "state.json"), "utf8")) as Job;
        if (
          (job.status === "running" || job.status === "queued") &&
          Date.now() - Date.parse(job.startedAt) > 20000
        ) {
          let live = false;
          if (job.pid) {
            try {
              process.kill(job.pid, 0);
              live = true;
            } catch {}
          }
          if (!live)
            return [
              {
                ...job,
                status: "failed" as const,
                error:
                  "The transaction runner stopped or could not start. Check the log and package manager for the final state.",
              },
            ];
        }
        return [job];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
export function readLog(root: string, id: string): string {
  if (!/^[0-9a-f-]{36}$/.test(id)) return "";
  try {
    const fd = openSync(join(root, id, "output.log"), "r");
    try {
      const size = fstatSync(fd).size,
        length = Math.min(size, 100000),
        buffer = Buffer.alloc(length);
      const count = readSync(fd, buffer, 0, length, size - length);
      return buffer
        .subarray(0, count)
        .toString("utf8")
        .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")
        .replace(/\r/g, "\n");
    } finally {
      closeSync(fd);
    }
  } catch {
    return "Waiting for log…";
  }
}
export async function startJob(
  plan: Plan,
  root: string,
  assets: string,
  launchTerminal?: (args: string[]) => Promise<void>,
): Promise<Job> {
  const commands = plan.commands.map((c) => {
    const file = binary(c.file);
    if (!file) throw new Error(`${c.file} was not found.`);
    return { ...c, file };
  });
  if (!commands.length) throw new Error("Empty transaction.");
  if (commands.some((c) => c.terminal) && !launchTerminal)
    throw new Error("Interactive transactions require Vicinae's terminal launcher.");
  const python = binary("python3");
  if (!python) throw new Error("python3 is required.");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const job: Job = {
    id: randomUUID(),
    title: plan.title,
    backend: plan.backend,
    status: "queued",
    startedAt: new Date().toISOString(),
  };
  const dir = join(root, job.id);
  mkdirSync(dir, { mode: 0o700 });
  writeFileSync(join(dir, "plan.json"), JSON.stringify({ ...plan, commands }), { mode: 0o600 });
  writeFileSync(join(dir, "state.json"), JSON.stringify(job), { mode: 0o600 });
  const runner = join(assets, "runner.py");
  if (commands.some((c) => c.terminal)) {
    try {
      await launchTerminal!([python, runner, dir]);
    } catch (error) {
      writeFileSync(
        join(dir, "state.json"),
        JSON.stringify({ ...job, status: "failed", error: String(error) }),
      );
      throw error;
    }
    return job;
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(python, [runner, dir], { detached: true, stdio: "ignore" });
    child.once("error", (error) => {
      writeFileSync(
        join(dir, "state.json"),
        JSON.stringify({ ...job, status: "failed", error: error.message }),
      );
      reject(error);
    });
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
  return job;
}
