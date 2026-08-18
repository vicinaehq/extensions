import { readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { RunningProcess } from "./types";

const SKIP = new Set([
  "caffeinate",
  "systemd-inhibit",
  "gnome-session-inhibit",
  "sleep",
  "tail",
  "kernel_task",
  "launchd",
  "init",
  "systemd",
  "kthreadd",
  "bash",
  "zsh",
  "sh",
  "fish",
  "node",
  "vicinae",
]);

export function listRunningProcesses(): RunningProcess[] {
  const processes = process.platform === "linux" ? fromProc() : fromPs();
  const results: RunningProcess[] = [];

  for (const entry of processes) {
    const name = cleanName(entry.name);
    if (!name || SKIP.has(name.toLowerCase())) continue;
    if (name.startsWith("[") || name.startsWith("-")) continue;
    results.push({ pid: entry.pid, name });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name) || a.pid - b.pid);
}

function fromProc(): RunningProcess[] {
  const results: RunningProcess[] = [];
  let entries: string[];
  try {
    entries = readdirSync("/proc");
  } catch {
    return fromPs();
  }

  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    try {
      const cmdline = readFileSync(`/proc/${pid}/cmdline`);
      if (cmdline.length === 0) continue;
      const comm = readFileSync(`/proc/${pid}/comm`, "utf8").trim();
      results.push({ pid, name: comm || basename(cmdline.toString("utf8").split("\0")[0] ?? "") });
    } catch {
      // process exited
    }
  }
  return results;
}

function fromPs(): RunningProcess[] {
  try {
    const output = execFileSync("ps", ["-axo", "pid=,comm="], {
      encoding: "utf8",
      timeout: 2000,
    });
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = /^(\d+)\s+(.+)$/.exec(line);
        if (!match) return null;
        return { pid: Number(match[1]), name: match[2].trim() };
      })
      .filter((value): value is RunningProcess => value !== null);
  } catch {
    throw new Error("Unable to list running processes. Check that ps is installed and try again.");
  }
}

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.endsWith(".exe")) return trimmed.slice(0, -4);
  if (trimmed.endsWith(".app")) return trimmed.slice(0, -4);
  const slash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

function basename(path: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return slash >= 0 ? path.slice(slash + 1) : path;
}
