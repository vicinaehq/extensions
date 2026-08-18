import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { InhibitBackend } from "./types";
import { prefs } from "./prefs";

export interface SpawnInhibitOptions {
  durationSec?: number;
  waitPid?: number;
  reason: string;
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

export function startInhibit(options: SpawnInhibitOptions): { pid: number; backend: InhibitBackend } {
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
  return { pid: child.pid, backend };
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
