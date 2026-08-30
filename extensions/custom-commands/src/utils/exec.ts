import { exec } from "node:child_process";
import { promisify } from "node:util";
import { showToast, Toast, Clipboard, closeMainWindow, getPreferenceValues, runInTerminal } from "@vicinae/api";
import { spawn } from "node:child_process";
import os from "node:os";

const execAsync = promisify(exec);

export interface Preferences {
  terminal: string;
  defaultWorkdir: string;
}

/** All {{name}} placeholders in the command */
export function extractPlaceholders(command: string): string[] {
  const set = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command))) {
    const key = m[1];
    if (key) set.add(key.toLowerCase());
  }
  return [...set];
}

/** System-resolvable placeholders that don't require user input */
const SYSTEM_PLACEHOLDERS = new Set(["clipboard", "selection", "home", "user", "date", "time", "datetime"]);

export function isSystemPlaceholder(key: string): boolean {
  return SYSTEM_PLACEHOLDERS.has(key.toLowerCase());
}

export async function resolveSystemPlaceholder(key: string): Promise<string> {
  const lower = key.toLowerCase();
  switch (lower) {
    case "clipboard": {
      try {
        const text = await Clipboard.readText();
        return text ?? "";
      } catch {
        return "";
      }
    }
    case "selection": {
      try {
        const text = await Clipboard.readText();
        return text ?? "";
      } catch {
        return "";
      }
    }
    case "home":
      return os.homedir();
    case "user":
      return os.userInfo().username ?? "";
    case "date":
      return new Date().toISOString().slice(0, 10);
    case "time":
      return new Date().toLocaleTimeString();
    case "datetime":
      return new Date().toLocaleString();
    default:
      return "";
  }
}

function shellEscape(arg: string): string {
  return `'${arg.split("'").join("'\\''")}'`;
}

export function substituteAll(
  command: string,
  values: Record<string, string>,
): string {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) normalized[k.toLowerCase()] = v;
  let out = command;
  for (const [key, val] of Object.entries(normalized)) {
    const re = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi");
    const finalVal = isSystemPlaceholder(key) ? shellEscape(val) : val;
    out = out.replace(re, finalVal);
  }
  return out;
}

function parseTerminalPref(pref: string): string[] {
  const result: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < pref.length; i++) {
    const c = pref[i];
    if (c === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (c === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (c === " " && !inSingle && !inDouble) {
      if (current) {
        result.push(current);
        current = "";
      }
      continue;
    }
    current += c;
  }
  if (current) result.push(current);
  return result;
}

async function tryRunInTerminal(finalCommand: string, cwd?: string): Promise<void> {
  await runInTerminal(["bash", "-c", finalCommand], {
    hold: true,
    workingDirectory: cwd,
  });
}

async function runWithCustomTerminal(prefTerminal: string, finalCommand: string, cwd?: string): Promise<void> {
  const parts = parseTerminalPref(prefTerminal);
  if (parts.length === 0) throw new Error("Empty terminal preference");
  const hasShell = prefTerminal.includes("bash -c") || prefTerminal.includes("sh -c");
  if (hasShell) {
    const quoted = finalCommand.split("'").join("'\\''");
    const full = `${prefTerminal} '${quoted}'`;
    await execAsync(full, { cwd, timeout: 10_000 });
    return;
  }
  const quoted = finalCommand.split("'").join("'\\''");
  const shellSnippet = `${quoted}; exec bash`;
  const terminalBin = parts[0];
  if (!terminalBin) throw new Error("Invalid terminal command");
  const terminalArgs = [...parts.slice(1), "bash", "-c", shellSnippet];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(terminalBin, terminalArgs, { cwd, detached: true, stdio: "ignore" });
    child.on("error", reject);
    child.unref();
    setTimeout(() => resolve(), 300);
  });
}

export async function executeCustomCommand(opts: {
  command: string;
  workdir?: string;
  terminal: boolean;
  args?: string;
  values?: Record<string, string>;
}): Promise<void> {
  const prefs = getPreferenceValues<Preferences>();
  const placeholders = extractPlaceholders(opts.command);

  const values: Record<string, string> = { ...(opts.values ?? {}) };
  if (opts.args !== undefined && placeholders.includes("args") && values["args"] === undefined) {
    values["args"] = opts.args;
  }

  for (const key of placeholders) {
    if (values[key] === undefined && isSystemPlaceholder(key)) {
      values[key] = await resolveSystemPlaceholder(key);
    }
  }

  const finalCommand = placeholders.length > 0 ? substituteAll(opts.command, values) : opts.command;
  const cwd = opts.workdir?.trim() || prefs.defaultWorkdir?.trim() || undefined;

  if (opts.terminal) {
    const prefTerminal = prefs.terminal?.trim();
    try {
      if (prefTerminal) {
        try {
          await runWithCustomTerminal(prefTerminal, finalCommand, cwd);
        } catch (e) {
          console.warn("Custom terminal failed, falling back to runInTerminal:", e);
          await tryRunInTerminal(finalCommand, cwd);
        }
      } else {
        await tryRunInTerminal(finalCommand, cwd);
      }
      await showToast({ style: Toast.Style.Success, title: "Launched in terminal", message: finalCommand.slice(0, 80) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to launch terminal",
        message: msg.slice(0, 300) + "\nTip: check Preferences → Terminal or run as background.",
      });
      return;
    }
    await closeMainWindow();
    return;
  }

  try {
    const { stdout, stderr } = await execAsync(finalCommand, { cwd, timeout: 30_000 });
    const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n").trim();
    if (output) {
      await Clipboard.copy(output);
      await showToast({
        style: Toast.Style.Success,
        title: "Command executed",
        message: output.length > 80 ? `${output.slice(0, 80)}… (copied)` : output,
      });
    } else {
      await showToast({ style: Toast.Style.Success, title: "Command executed", message: "No output" });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stdout = (e as { stdout?: string })?.stdout?.trim();
    const stderr = (e as { stderr?: string })?.stderr?.trim();
    const detail = [stdout, stderr, msg].filter(Boolean).join("\n").slice(0, 300);
    await showToast({ style: Toast.Style.Failure, title: "Command failed", message: detail || msg });
  }
  await closeMainWindow();
}
