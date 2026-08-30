import { showToast, Toast, Clipboard, closeMainWindow, getPreferenceValues, runInTerminal } from "@vicinae/api";
import { spawn } from "node:child_process";
import os from "node:os";

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

function buildPositionalTemplate(command: string, values: Record<string, string>): { template: string; positionalArgs: string[] } {
  const placeholders = extractPlaceholders(command);
  // Preserve order of first appearance
  const orderedKeys: string[] = [];
  const seen = new Set<string>();
  const reScan = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = reScan.exec(command))) {
    const k = m[1]?.toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      orderedKeys.push(k);
    }
  }
  // Also include any keys that are in values but not in command order? already covered by placeholders order
  // Ensure we include all placeholders even if not scanned due to case
  for (const k of placeholders) if (!seen.has(k)) { seen.add(k); orderedKeys.push(k); }

  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) normalized[k.toLowerCase()] = v;

  const positionalArgs: string[] = orderedKeys.map((k) => normalized[k] ?? "");

  let template = command;
  orderedKeys.forEach((key, idx) => {
    const pos = idx + 1;
    const replacement = `"$${pos}"`;
    // Replace quoted forms first to avoid nested quotes: "{{key}}" and '{{key}}' -> "$N"
    const doubleQuotedRe = new RegExp(`"\\{\\{\\s*${key}\\s*\\}\\}"`, "gi");
    const singleQuotedRe = new RegExp(`'\\{\\{\\s*${key}\\s*\\}\\}'`, "gi");
    const bareRe = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi");
    template = template.replace(doubleQuotedRe, replacement);
    template = template.replace(singleQuotedRe, replacement);
    template = template.replace(bareRe, replacement);
  });

  return { template, positionalArgs };
}

async function tryRunInTerminal(template: string, positionalArgs: string[], cwd?: string): Promise<void> {
  // Use positional parameters so values are never shell-interpreted
  // bash -c 'template' bash arg1 arg2 ...  where $1, $2 expand to data safely
  const args = ["bash", "-c", template, "bash", ...positionalArgs];
  await runInTerminal(args, {
    hold: true,
    workingDirectory: cwd,
  });
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
  // Append "; exec bash" so terminal stays open after command
  const templateWithHold = `${template}; exec bash`;
  const terminalArgs = [...parts.slice(1), "bash", "-c", templateWithHold, "bash", ...positionalArgs];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(terminalBin, terminalArgs, { cwd, detached: true, stdio: "ignore" });
    child.on("error", reject);
    child.unref();
    setTimeout(() => resolve(), 300);
  });
}

function execWithPositional(
  template: string,
  positionalArgs: string[],
  cwd?: string,
  timeout = 30_000,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-c", template, "bash", ...positionalArgs], { cwd });
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
