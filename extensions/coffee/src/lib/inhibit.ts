import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { accessSync, constants, readFileSync } from "node:fs";
import { InhibitBackend } from "./types";
import { prefs } from "./prefs";

export interface SpawnInhibitOptions {
  durationSec?: number;
  waitPid?: number;
  reason: string;
}

export interface StartedInhibit {
  pid: number;
  backend: InhibitBackend;
  processIdentity: string | null;
}

const CAFFEINATE = "/usr/bin/caffeinate";

export function detectBackend(): InhibitBackend {
  if (process.platform === "darwin" && executable(CAFFEINATE)) return "caffeinate";
  if (onPath("systemd-inhibit")) return "systemd-inhibit";
  if (onPath("gnome-session-inhibit")) return "gnome-session-inhibit";
  if (executable(CAFFEINATE)) return "caffeinate";
  throw new Error(
    "No sleep-inhibit backend found. Install systemd (systemd-inhibit) on Linux, or use macOS caffeinate.",
  );
}

export function isPidAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function stopPid(pid: number): void {
  if (!pid || pid <= 0) return;
  try {
    process.kill(-pid, "SIGTERM");
    return;
  } catch {
    // process is not a group leader
  }
  if (!isPidAlive(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
}

export function startInhibit(options: SpawnInhibitOptions): StartedInhibit {
  const backend = detectBackend();
  const child =
    backend === "caffeinate"
      ? spawnCaffeinate(options)
      : backend === "systemd-inhibit"
        ? spawnSystemd(options)
        : spawnGnome(options);

  child.unref();
  if (!child.pid) {
    throw new Error("Failed to start the inhibit process");
  }

  // Best-effort startup check: if backend exits immediately, surface it as failure.
  if (!isPidAlive(child.pid)) {
    throw new Error(`Failed to start ${backend} inhibitor process.`);
  }

  return { pid: child.pid, backend, processIdentity: getProcessIdentity(child.pid) };
}

export function processIdentityMatches(pid: number, expected: string | null): boolean {
  if (!expected) return false;
  const current = getProcessIdentity(pid);
  return current !== null && current === expected;
}

function spawnCaffeinate(options: SpawnInhibitOptions) {
  const preferences = prefs();
  const args: string[] = [];
  if (preferences["prevent-display"]) args.push("-d");
  if (preferences["prevent-system"]) args.push("-i");
  if (preferences["prevent-disk"]) args.push("-m");
  if (args.length === 0) args.push("-i");
  if (options.durationSec && options.durationSec > 0) {
    args.push("-t", String(Math.ceil(options.durationSec)));
  }
  if (options.waitPid) {
    args.push("-w", String(options.waitPid));
  }

  return spawn(CAFFEINATE, args, {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, COFFEE_VICINAE: "1" },
  });
}

function spawnSystemd(options: SpawnInhibitOptions) {
  const preferences = prefs();
  const what: string[] = [];
  if (preferences["prevent-display"]) what.push("idle");
  if (preferences["prevent-system"]) what.push("sleep");
  if (preferences["prevent-lid"]) what.push("handle-lid-switch");
  if (what.length === 0) what.push("idle", "sleep");

  const inner = waitCommand(options);

  return spawn(
    "systemd-inhibit",
    [
      `--what=${what.join(":")}`,
      "--who=Coffee",
      `--why=${options.reason}`,
      "--mode=block",
      "--",
      ...inner,
    ],
    {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, COFFEE_VICINAE: "1" },
    },
  );
}

function spawnGnome(options: SpawnInhibitOptions) {
  const preferences = prefs();
  const args: string[] = ["--reason", options.reason];
  if (preferences["prevent-display"]) args.push("--inhibit", "idle");
  if (preferences["prevent-system"]) {
    args.push("--inhibit", "suspend");
    args.push("--inhibit", "idle");
  }
  if (!preferences["prevent-display"] && !preferences["prevent-system"]) {
    args.push("--inhibit", "idle");
    args.push("--inhibit", "suspend");
  }
  args.push("--", ...waitCommand(options));

  return spawn("gnome-session-inhibit", args, {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, COFFEE_VICINAE: "1" },
  });
}

function waitCommand(options: SpawnInhibitOptions): string[] {
  if (options.waitPid) {
    if (onPath("tail")) return ["tail", `--pid=${options.waitPid}`, "-f", "/dev/null"];
    return [
      "sh",
      "-c",
      `while kill -0 ${Number(options.waitPid)} 2>/dev/null; do sleep 2; done`,
    ];
  }
  if (options.durationSec && options.durationSec > 0) {
    return ["sleep", String(Math.ceil(options.durationSec))];
  }
  return ["sh", "-c", "sleep infinity || sleep 2147483647"];
}

function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function onPath(name: string): boolean {
  const paths = (process.env.PATH ?? "").split(":");
  return paths.some((dir) => dir.length > 0 && executable(`${dir}/${name}`));
}

function getProcessIdentity(pid: number): string | null {
  if (!isPidAlive(pid)) return null;

  if (process.platform === "linux") {
    try {
      const comm = readFileSync(`/proc/${pid}/comm`, "utf8").trim();
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const close = stat.lastIndexOf(")");
      if (close === -1) return null;
      const after = stat.slice(close + 2).trim().split(/\s+/);
      const startTicks = after[19];
      if (!startTicks) return null;
      return `${comm}:${startTicks}`;
    } catch {
      return null;
    }
  }

  try {
    const output = execFileSync("ps", ["-o", "comm=", "-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 1000,
    })
      .trim()
      .replace(/\s+/g, " ");
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}
