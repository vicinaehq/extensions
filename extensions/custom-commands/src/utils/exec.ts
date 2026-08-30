import { showToast, Toast, Clipboard, closeMainWindow, getPreferenceValues, runInTerminal } from "@vicinae/api";
import { spawn } from "node:child_process";
import os from "node:os";

export interface Preferences {
  terminal: string;
  defaultWorkdir: string;
}

const isWindows = process.platform === "win32";

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

function parseTerminalPref(pref: string): string[] {
  const result: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < pref.length; i++) {
    const c = pref[i];
    const escaped = (() => {
      let n = 0;
      for (let j = i - 1; j >= 0 && pref[j] === "\\"; j--) n++;
      return n % 2 === 1;
    })();
    if (!escaped) {
      if (c === "'" && !inDouble) {
        inSingle = !inSingle;
        continue;
      }
      if (c === '"' && !inSingle) {
        inDouble = !inDouble;
        continue;
      }
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

function buildPositionalTemplate(command: string, values: Record<string, string>): { template: string; positionalArgs: string[] } {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) normalized[k.toLowerCase()] = v;

  const keyToIndex = new Map<string, number>();
  const orderedKeys: string[] = [];
  const reOrder = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = reOrder.exec(command))) {
    const k = m[1]?.toLowerCase();
    if (k && !keyToIndex.has(k)) {
      keyToIndex.set(k, orderedKeys.length);
      orderedKeys.push(k);
    }
  }
  for (const k of Object.keys(normalized)) if (!keyToIndex.has(k)) { keyToIndex.set(k, orderedKeys.length); orderedKeys.push(k); }

  const positionalArgs: string[] = orderedKeys.map((k) => normalized[k] ?? "");

  let template = "";
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  while (i < command.length) {
    if (command.startsWith("{{", i)) {
      const end = command.indexOf("}}", i + 2);
      if (end !== -1) {
        const rawKey = command.slice(i + 2, end).trim();
        const keyLower = rawKey.toLowerCase();
        const idx = keyToIndex.get(keyLower);
        if (idx !== undefined) {
          if (isWindows) {
            if (inSingle) {
              template += `' + $args[${idx}] + '`;
            } else if (inDouble) {
              template += `$($args[${idx}])`;
            } else {
              template += `$args[${idx}]`;
            }
          } else {
            if (inSingle) {
              template += `'"$${idx + 1}"'`;
            } else if (inDouble) {
              template += `$${idx + 1}`;
            } else {
              template += `"$${idx + 1}"`;
            }
          }
          i = end + 2;
          continue;
        }
      }
    }
    const c = command[i];
    template += c;
    const escaped = (() => {
      let backslashes = 0;
      for (let j = i - 1; j >= 0 && command[j] === "\\"; j--) backslashes++;
      return backslashes % 2 === 1;
    })();
    if (!escaped) {
      if (c === "'" && !inDouble) inSingle = !inSingle;
      else if (c === '"' && !inSingle) inDouble = !inDouble;
    }
    i++;
  }

  return { template, positionalArgs };
}

async function tryRunInTerminal(template: string, positionalArgs: string[], cwd?: string): Promise<void> {
  if (isWindows) {
    const args = ["powershell.exe", "-NoProfile", "-Command", template, ...positionalArgs];
    await runInTerminal(args, { hold: true, workingDirectory: cwd });
  } else {
    const args = ["bash", "-c", template, "bash", ...positionalArgs];
    await runInTerminal(args, { hold: true, workingDirectory: cwd });
  }
}

async function runWithCustomTerminal(
  prefTerminal: string,
  template: string,
  positionalArgs: string[],
  cwd?: string,
): Promise<void> {
  const parts = parseTerminalPref(prefTerminal);
  if (parts.length === 0) throw new Error("Empty terminal preference");
  const terminalBin = parts[0];
  if (!terminalBin) throw new Error("Invalid terminal command");
  if (isWindows) {
    const templateWithHold = `${template}; pause`;
    const terminalArgs = [...parts.slice(1), "powershell.exe", "-NoProfile", "-Command", templateWithHold, ...positionalArgs];
    await new Promise<void>((resolve, reject) => {
      const child = spawn(terminalBin, terminalArgs, { cwd, detached: true, stdio: "ignore" });
      child.on("error", reject);
      child.unref();
      setTimeout(() => resolve(), 300);
    });
  } else {
    const templateWithHold = `${template}; exec bash`;
    const terminalArgs = [...parts.slice(1), "bash", "-c", templateWithHold, "bash", ...positionalArgs];
    await new Promise<void>((resolve, reject) => {
      const child = spawn(terminalBin, terminalArgs, { cwd, detached: true, stdio: "ignore" });
      child.on("error", reject);
      child.unref();
      setTimeout(() => resolve(), 300);
    });
  }
}

function execWithPositional(
  template: string,
  positionalArgs: string[],
  cwd?: string,
  timeout = 30_000,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = isWindows
      ? spawn("powershell.exe", ["-NoProfile", "-Command", template, ...positionalArgs], { cwd })
      : spawn("bash", ["-c", template, "bash", ...positionalArgs], { cwd });
    let stdout = "";
    let stderr = "";
    let timer: NodeJS.Timeout | undefined;
    if (timeout) {
      timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(Object.assign(new Error(`Command timed out after ${timeout}ms`), { stdout, stderr }));
      }, timeout);
    }
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else {
        const err = new Error(stderr || `Command failed with code ${code}`) as Error & { stdout?: string; stderr?: string; code?: number | null };
        err.stdout = stdout;
        err.stderr = stderr;
        err.code = code;
        reject(err);
      }
    });
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

  const { template, positionalArgs } = buildPositionalTemplate(opts.command, values);
  const cwd = opts.workdir?.trim() || prefs.defaultWorkdir?.trim() || undefined;
  const displayCommand = opts.command.slice(0, 80);

  if (opts.terminal) {
    const prefTerminal = prefs.terminal?.trim();
    try {
      if (prefTerminal) {
        try {
          await runWithCustomTerminal(prefTerminal, template, positionalArgs, cwd);
        } catch (e) {
          console.warn("Custom terminal failed, falling back to runInTerminal:", e);
          await tryRunInTerminal(template, positionalArgs, cwd);
        }
      } else {
        await tryRunInTerminal(template, positionalArgs, cwd);
      }
      await showToast({ style: Toast.Style.Success, title: "Launched in terminal", message: displayCommand });
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
    const { stdout, stderr } = await execWithPositional(template, positionalArgs, cwd, 30_000);
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
    await closeMainWindow();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stdout = (e as { stdout?: string })?.stdout?.trim();
    const stderr = (e as { stderr?: string })?.stderr?.trim();
    const detail = [stdout, stderr, msg].filter(Boolean).join("\n").slice(0, 300);
    await showToast({ style: Toast.Style.Failure, title: "Command failed", message: detail || msg });
    return;
  }
}
