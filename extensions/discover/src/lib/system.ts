import { execFile } from "node:child_process";
import { accessSync, constants, readFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";

export function binary(name: string): string | undefined {
  const paths = isAbsolute(name)
    ? [name]
    : (process.env.PATH || "/usr/bin:/bin")
        .split(":")
        .filter(Boolean)
        .map((p) => join(p, name));
  return paths.find((p) => {
    try {
      accessSync(p, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}
export async function run(
  name: string,
  args: string[],
  options: {
    codes?: number[];
    timeout?: number;
    signal?: AbortSignal;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<string> {
  const file = binary(name);
  if (!file) throw new Error(`${name} is not installed. Check System and Support.`);
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        timeout: options.timeout ?? 30_000,
        signal: options.signal,
        env: { ...process.env, LC_ALL: "C", NO_COLOR: "1", ...options.env },
      },
      (error, stdout, stderr) => {
        if (
          error &&
          (!(options.codes ?? []).includes(Number(error.code)) ||
            (Number(error.code) === 1 && !!stderr.trim()))
        ) {
          reject(new Error((stderr.trim() || stdout.trim() || error.message).slice(0, 5000)));
        } else resolve(stdout);
      },
    );
  });
}
export function osRelease(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync("/etc/os-release", "utf8")
        .split("\n")
        .filter((x) => x.includes("="))
        .map((x) => {
          const i = x.indexOf("=");
          return [x.slice(0, i), x.slice(i + 1).replace(/^"|"$/g, "")];
        }),
    );
  } catch {
    return {};
  }
}
export function assertPackage(name: string): string {
  if (!/^[a-zA-Z0-9@_+][a-zA-Z0-9@_.+:-]*$/.test(name) || name.length > 250)
    throw new Error("Invalid package name.");
  return name;
}
export function assertRepo(name: string): string {
  if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(name)) throw new Error("Invalid repository name.");
  return name;
}
export function assertRef(ref: string): string {
  if (!/^(app|runtime)\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_]+\/[a-zA-Z0-9_.-]+$/.test(ref))
    throw new Error("Invalid Flatpak reference.");
  return ref;
}
export function literalRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export async function collect<T>(
  tasks: { label: string; run: () => Promise<T[]> }[],
): Promise<{ items: T[]; warnings: string[] }> {
  const results = await Promise.allSettled(tasks.map((t) => t.run()));
  const items: T[] = [];
  const warnings: string[] = [];
  results.forEach((r, i) =>
    r.status === "fulfilled"
      ? items.push(...r.value)
      : warnings.push(`${tasks[i].label}: ${message(r.reason)}`),
  );
  return { items, warnings };
}
