import { exec } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import { Clipboard } from "@vicinae/api";

const execAsync = promisify(exec);

export interface SelectionOptions {
  minFiles?: number;
  multiple?: boolean;
  title?: string;
  promptIfNone?: boolean;
  allowedExtensions?: string[];
  filterName?: string;
}

function cleanFilePath(rawPath: string, allowedExtensions: string[] = [".pdf"]): string | null {
  let cleaned = rawPath.trim();
  if (!cleaned) return null;

  if (cleaned.startsWith("file://")) {
    cleaned = decodeURIComponent(cleaned.replace(/^file:\/\//, ""));
  }

  // Remove surrounding quotes if any
  cleaned = cleaned.replace(/^['"]|['"]$/g, "");

  const hasAllowedExt = allowedExtensions.some((ext) =>
    cleaned.toLowerCase().endsWith(ext.toLowerCase())
  );

  if (hasAllowedExt && fs.existsSync(cleaned)) {
    return path.resolve(cleaned);
  }
  return null;
}

async function getClipboardFiles(allowedExtensions: string[]): Promise<string[]> {
  const found = new Set<string>();

  // 1. Try Linux Wayland wl-paste (text/uri-list and x-special/gnome-copied-files)
  if (process.platform === "linux") {
    try {
      const { stdout } = await execAsync("wl-paste -t text/uri-list 2>/dev/null || true");
      if (stdout) {
        for (const line of stdout.split(/\r?\n/)) {
          const cleaned = cleanFilePath(line, allowedExtensions);
          if (cleaned) found.add(cleaned);
        }
      }
    } catch {
      // ignore
    }

    try {
      const { stdout } = await execAsync(
        "wl-paste -t x-special/gnome-copied-files 2>/dev/null || true"
      );
      if (stdout) {
        for (const line of stdout.split(/\r?\n/)) {
          if (line.startsWith("copy") || line.startsWith("cut")) continue;
          const cleaned = cleanFilePath(line, allowedExtensions);
          if (cleaned) found.add(cleaned);
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. Try Windows PowerShell clipboard (FileDropList)
  if (process.platform === "win32") {
    try {
      const { stdout } = await execAsync(
        'powershell.exe -NoProfile -NonInteractive -Command "Get-Clipboard -Format FileDropList"'
      );
      if (stdout) {
        for (const line of stdout.split(/\r?\n/)) {
          const cleaned = cleanFilePath(line, allowedExtensions);
          if (cleaned) found.add(cleaned);
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. Try @vicinae/api Clipboard.readText()
  try {
    const text = await Clipboard.readText();
    if (text) {
      for (const line of text.split(/\r?\n/)) {
        const cleaned = cleanFilePath(line, allowedExtensions);
        if (cleaned) found.add(cleaned);
      }
    }
  } catch {
    // ignore
  }

  return Array.from(found);
}

async function getMacOSFinderSelection(allowedExtensions: string[]): Promise<string[]> {
  try {
    const script = `
      tell application "Finder"
        set theSelection to selection
        set posixPaths to {}
        repeat with aFile in theSelection
          set end of posixPaths to POSIX path of (aFile as alias)
        end repeat
        return posixPaths
      end tell
    `;
    const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
    if (!stdout) return [];
    return stdout
      .split(",")
      .map((s) => cleanFilePath(s.trim(), allowedExtensions))
      .filter((s): s is string => s !== null);
  } catch {
    return [];
  }
}

async function pickFilesWithDialog(options: SelectionOptions): Promise<string[]> {
  const {
    multiple = false,
    title = "Select File(s)",
    allowedExtensions = [".pdf"],
    filterName = "Supported files",
  } = options;

  if (process.platform === "linux") {
    try {
      const multFlag = multiple ? '--multiple --separator="|"' : "";
      const patterns = allowedExtensions
        .map((ext) => `*${ext} *${ext.toUpperCase()}`)
        .join(" ");
      const filter = `${filterName} | ${patterns}`;
      const cmd = `zenity --file-selection ${multFlag} --file-filter="${filter}" --title="${title.replace(/"/g, '\\"')}"`;
      const { stdout } = await execAsync(cmd);
      if (!stdout || !stdout.trim()) {
        throw new Error("File selection cancelled");
      }
      const rawPaths = multiple ? stdout.trim().split("|") : [stdout.trim()];
      const valid = rawPaths
        .map((p) => cleanFilePath(p, allowedExtensions))
        .filter((p): p is string => p !== null);

      if (valid.length === 0) {
        throw new Error("No valid files selected");
      }
      return valid;
    } catch (err: any) {
      if (err.message && err.message.includes("cancelled")) {
        throw new Error("File selection cancelled");
      }
      throw new Error(`File selection failed: ${err.message || String(err)}`);
    }
  }

  if (process.platform === "darwin") {
    try {
      const prompt = title.replace(/"/g, '\\"');
      const mult = multiple ? "with multiple selections allowed" : "";
      const typeList = allowedExtensions.map((e) => `"${e.replace(/^\./, "")}"`).join(",");
      const script = `choose file with prompt "${prompt}" of type {${typeList}} ${mult}`;
      const { stdout } = await execAsync(`osascript -e '${script}'`);
      if (!stdout.trim()) {
        throw new Error("File selection cancelled");
      }
      const paths = stdout
        .split(",")
        .map((p) => cleanFilePath(p.trim(), allowedExtensions))
        .filter((p): p is string => p !== null);
      return paths;
    } catch {
      throw new Error("File selection cancelled");
    }
  }

  if (process.platform === "win32") {
    try {
      const multBool = multiple ? "$true" : "$false";
      const filterStr = `${filterName} (${allowedExtensions.map((e) => `*${e}`).join(", ")})|${allowedExtensions.map((e) => `*${e}`).join(";")}`;
      const psScript = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Title = '${title.replace(/'/g, "''")}'; $f.Filter = '${filterStr}'; $f.Multiselect = ${multBool}; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $f.FileNames -join [Environment]::NewLine }`;
      const { stdout } = await execAsync(
        `powershell.exe -NoProfile -NonInteractive -Command "${psScript}"`
      );
      if (!stdout || !stdout.trim()) {
        throw new Error("File selection cancelled");
      }
      const rawPaths = stdout.trim().split(/\r?\n/);
      const valid = rawPaths
        .map((p) => cleanFilePath(p, allowedExtensions))
        .filter((p): p is string => p !== null);
      if (valid.length === 0) {
        throw new Error("No valid files selected");
      }
      return valid;
    } catch (err: any) {
      if (err.message && err.message.includes("cancelled")) {
        throw new Error("File selection cancelled");
      }
      throw new Error(`File selection failed: ${err.message || String(err)}`);
    }
  }

  throw new Error("Unsupported platform for file dialog");
}

export async function getSelectedOrPickedFiles(options: SelectionOptions = {}): Promise<string[]> {
  const minFiles = options.minFiles ?? 1;
  const allowedExtensions = options.allowedExtensions ?? [".pdf"];

  // 1. Try macOS Finder selection first if on macOS
  if (process.platform === "darwin") {
    const finderFiles = await getMacOSFinderSelection(allowedExtensions);
    if (finderFiles.length >= minFiles) {
      return finderFiles;
    }
  }

  // 2. Try clipboard (Nautilus copy, copied paths)
  const clipboardFiles = await getClipboardFiles(allowedExtensions);
  if (clipboardFiles.length >= minFiles) {
    return clipboardFiles;
  }

  // 3. Fallback to interactive native dialog
  if (options.promptIfNone !== false) {
    return await pickFilesWithDialog(options);
  }

  throw new Error(
    minFiles > 1
      ? `You must select at least ${minFiles} files`
      : "No file has been selected"
  );
}
