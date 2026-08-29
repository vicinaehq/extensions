export interface AsepritePreferences {
  asepritePath: string;
}

export function getAsepritePath(preferences: AsepritePreferences): string {
  const customPath = preferences.asepritePath?.trim();
  if (customPath) {
    return customPath;
  }

  const platform = process.platform;
  const fs = require("fs");
  
  if (platform === "win32") {
    const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const localAppData = process.env.LOCALAPPDATA || "";
    
    const possiblePaths = [
      `${programFiles}\\Aseprite\\aseprite.exe`,
      `${programFilesX86}\\Aseprite\\aseprite.exe`,
      `${localAppData}\\Aseprite\\aseprite.exe`,
      `${localAppData}\\Programs\\Aseprite\\aseprite.exe`,
    ];
    
    for (const path of possiblePaths) {
      if (fs.existsSync(path)) {
        return path;
      }
    }
    return "aseprite";
  } else if (platform === "darwin") {
    const possiblePaths = [
      "/Applications/Aseprite.app/Contents/MacOS/aseprite",
      "/usr/local/bin/aseprite",
      "/opt/homebrew/bin/aseprite",
    ];
    
    for (const path of possiblePaths) {
      if (fs.existsSync(path)) {
        return path;
      }
    }
    return "aseprite";
  } else {
    const possiblePaths = [
      "/usr/bin/aseprite",
      "/usr/local/bin/aseprite",
      "/opt/aseprite/aseprite",
      "/app/bin/aseprite",
      "/var/lib/flatpak/exports/bin/org.aseprite.Aseprite",
      `${process.env.HOME}/.local/bin/aseprite`,
    ];
    
    for (const path of possiblePaths) {
      if (fs.existsSync(path)) {
        return path;
      }
    }
    return "aseprite";
  }
}

export function getPreferencesFolder(): string {
  const platform = process.platform;
  const home = process.env.HOME || process.env.USERPROFILE || "";
  
  if (platform === "win32") {
    const appData = process.env.APPDATA || `${home}\\AppData\\Roaming`;
    return `${appData}\\Aseprite`;
  } else if (platform === "darwin") {
    return `${home}/Library/Application Support/Aseprite`;
  } else {
    const xdgConfig = process.env.XDG_CONFIG_HOME || `${home}/.config`;
    return `${xdgConfig}/aseprite`;
  }
}

export interface RecentFile {
  path: string;
  name: string;
  lastOpened: number;
}

export function parseRecentFiles(iniContent: string): RecentFile[] {
  const recentFiles: RecentFile[] = [];
  const lines = iniContent.split("\n");
  let inRecentFilesSection = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed === "[RecentFiles]") {
      inRecentFilesSection = true;
      continue;
    }
    
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      inRecentFilesSection = false;
      continue;
    }
    
    if (inRecentFilesSection && trimmed.includes("=")) {
      const [key, value] = trimmed.split("=", 2);
      // Handle both "file0" and "0000" formats
      let index = parseInt(key.replace("file", ""), 10);
      if (isNaN(index)) {
        index = parseInt(key, 10);
      }
      if (!isNaN(index)) {
        const path = value.trim().replace(/^"|"$/g, "");
        if (path) {
          recentFiles.push({
            path,
            name: path.split(/[/\\]/).pop() || path,
            lastOpened: Date.now() - index * 1000,
          });
        }
      }
    }
  }
  
  return recentFiles.sort((a, b) => b.lastOpened - a.lastOpened);
}

export function getPreviewPath(sourcePath: string): string {
  const path = require("path");
  const crypto = require("crypto");
  const hash = crypto.createHash("md5").update(sourcePath).digest("hex").slice(0, 8);
  const base = path.basename(sourcePath).replace(/\.[^.]+$/, "");
  return path.join(require("os").tmpdir(), `vicinae-aseprite-${base}-${hash}.png`);
}

export async function exportPreview(sourcePath: string, preferences: AsepritePreferences): Promise<string | null> {
  const fs = require("fs");
  const { spawn } = require("child_process");
  const asepritePath = getAsepritePath(preferences);
  const previewPath = getPreviewPath(sourcePath);

  // Reuse cached preview if newer than source
  try {
    if (fs.existsSync(previewPath) && fs.existsSync(sourcePath)) {
      const srcStat = fs.statSync(sourcePath);
      const prevStat = fs.statSync(previewPath);
      if (prevStat.mtimeMs > srcStat.mtimeMs) return previewPath;
    }
  } catch {}

  return new Promise((resolve) => {
    const child = spawn(asepritePath, ["--batch", sourcePath, "--save-as", previewPath], {
      stdio: "ignore",
      env: process.env,
    });
    child.on("error", () => resolve(null));
    child.on("close", (code: number) => {
      if (code === 0 && fs.existsSync(previewPath)) resolve(previewPath);
      else resolve(null);
    });
    // Timeout fallback
    setTimeout(() => { try { child.kill(); } catch {} resolve(null); }, 5000);
  });
}

export async function launchAseprite(args: string[], preferences: AsepritePreferences): Promise<void> {
  const asepritePath = getAsepritePath(preferences);
  const fs = require("fs");
  const { spawn } = require("child_process");
  
  // Validate path exists before spawning (skip for bare "aseprite" which resolves via PATH)
  if (asepritePath !== "aseprite" && !fs.existsSync(asepritePath)) {
    throw new Error(`Aseprite not found at: ${asepritePath}`);
  }
  
  return new Promise((resolve, reject) => {
    const child = spawn(asepritePath, args, {
      stdio: "ignore",
      detached: true,
      env: process.env
    });
    
    child.unref();
    
    child.on("error", (err) => {
      if (err.code === "ENOENT") {
        reject(new Error(`Aseprite not found at: ${asepritePath}`));
      } else {
        reject(err);
      }
    });
    
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Aseprite exited with code ${code}`));
      } else {
        resolve();
      }
    });
    
    child.on("spawn", () => resolve());
  });
}