import os from "node:os";
import path from "node:path";
import type { ShellName } from "./history";
export type { ShellName } from "./history";

export function expandPath(value: string, home = os.homedir()): string {
  const expanded = value === "~" ? home : value.startsWith("~/") ? path.join(home, value.slice(2)) : value;
  if (!path.isAbsolute(expanded) || expanded.includes("\0")) throw new Error("Use an absolute path or ~/path in preferences.");
  return expanded;
}

export function shellHistoryPath(shell: ShellName, env = process.env, home = os.homedir()): string {
  // HISTFILE is shell-specific; never apply an inherited Bash HISTFILE to Fish/Zsh.
  if (shell === "fish") {
    const name = env.fish_history && /^[a-zA-Z0-9_-]+$/.test(env.fish_history) ? env.fish_history : "fish";
    return path.join(env.XDG_DATA_HOME || path.join(home, ".local", "share"), "fish", `${name}_history`);
  }
  if (env.HISTFILE && detectShell(env) === shell) return expandPath(env.HISTFILE, home);
  if (shell === "zsh") return path.join(env.ZDOTDIR || home, ".zsh_history");
  return path.join(home, ".bash_history");
}

export function detectShell(env = process.env): ShellName {
  const name = path.basename(env.SHELL || "bash");
  return name === "fish" || name === "zsh" ? name : "bash";
}

export type Preferences = {
  shell?: string;
  historyPath?: string;
  shellPath?: string;
  maxItems?: string;
  workingDirectory?: string;
  hold?: boolean;
  reviewBeforeRun?: boolean;
  confirmBeforeRun?: boolean;
  saveHistory?: boolean;
};
export type Settings = {
  shell: ShellName;
  historyPath: string;
  shellPath: string;
  maxItems: number;
  workingDirectory: string;
  hold: boolean;
  reviewBeforeRun: boolean;
  confirmBeforeRun: boolean;
  saveHistory: boolean;
};

export function resolveSettings(prefs: Preferences, env = process.env, home = os.homedir()): Settings {
  const choice = prefs.shell || "auto";
  if (!["auto", "bash", "zsh", "fish"].includes(choice)) throw new Error("Choose Bash, Zsh, Fish, or Auto in preferences.");
  const shell = choice === "auto" ? detectShell(env) : choice as ShellName;
  const maxItems = Number(prefs.maxItems || "10000");
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 50000) throw new Error("Maximum History Items must be an integer from 1 to 50000.");
  const detectedExecutable = choice === "auto" && env.SHELL && path.basename(env.SHELL) === shell ? env.SHELL : undefined;
  return {
    shell,
    historyPath: prefs.historyPath ? expandPath(prefs.historyPath, home) : shellHistoryPath(shell, env, home),
    shellPath: expandPath(prefs.shellPath || detectedExecutable || (shell === "fish" ? "/usr/bin/fish" : `/bin/${shell}`), home),
    maxItems,
    workingDirectory: expandPath(prefs.workingDirectory || home, home),
    hold: prefs.hold ?? true,
    reviewBeforeRun: prefs.reviewBeforeRun ?? true,
    confirmBeforeRun: prefs.confirmBeforeRun ?? true,
    saveHistory: prefs.saveHistory ?? true,
  };
}
