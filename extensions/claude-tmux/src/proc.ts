import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";

export function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 10_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

async function parentPid(pid: number): Promise<number> {
  const stat = await readFile(`/proc/${pid}/stat`, "utf8");
  return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
}

export async function* ancestry(pid: number): AsyncGenerator<number> {
  for (let current = pid; current > 1; ) {
    yield current;
    try {
      current = await parentPid(current);
    } catch {
      return;
    }
  }
}
