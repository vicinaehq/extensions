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

interface RecentFile {
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

function getPreviewPath(sourcePath: string): string {
  const path = require("path");
  const crypto = require("crypto");
  const hash = crypto.createHash("md5").update(sourcePath).digest("hex").slice(0, 8);
  const base = path.basename(sourcePath).replace(/\.[^.]+$/, "");
  return path.join(require("os").tmpdir(), `vicinae-aseprite-${base}-${hash}.png`);
}

function getPreviewPathFresh(sourcePath: string): string {
  const path = require("path");
  const crypto = require("crypto");
  const base = path.basename(sourcePath).replace(/\.[^.]+$/, "");
  const unique = Date.now() + "-" + crypto.randomBytes(4).toString("hex");
  return path.join(require("os").tmpdir(), `vicinae-aseprite-${base}-${unique}.png`);
}

export function isFreshPreviewPath(path: string): boolean {
  // Fresh path: vicinae-aseprite-{base}-{timestamp}-{random}.png
  // Stable path: vicinae-aseprite-{base}-{8-char-hash}.png
  return /(?:^|[/\\])vicinae-aseprite-.*-\d{13}-[a-f0-9]{8}\.png$/i.test(path);
}

export async function exportPreview(sourcePath: string, preferences: AsepritePreferences): Promise<string | null> {
  const fs = require("fs");
  const { spawn } = require("child_process");
  const asepritePath = getAsepritePath(preferences);
  const stablePath = getPreviewPath(sourcePath);

  // Reuse cached preview if newer than source
  try {
    if (fs.existsSync(stablePath) && fs.existsSync(sourcePath)) {
      const srcStat = fs.statSync(sourcePath);
      const prevStat = fs.statSync(stablePath);
      if (prevStat.mtimeMs > srcStat.mtimeMs) {
        console.log(`[aseprite] Reusing fresh preview: ${stablePath}`);
        return stablePath;
      }
    }
  } catch {}

  // Export to unique fresh path to avoid browser caching, then update stable path
  const freshPath = getPreviewPathFresh(sourcePath);
  console.log(`[aseprite] Generating new preview: ${freshPath}`);

  return new Promise((resolve) => {
    const child = spawn(asepritePath, ["--batch", sourcePath, "--save-as", freshPath], {
      stdio: "ignore",
      env: process.env,
    });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { child.kill(); } catch {} resolve(null); }, 15000);
    child.on("error", (err: Error) => { 
      clearTimeout(timer); 
      console.error(`[aseprite] Spawn error: ${err.message}`);
      resolve(null); 
    });
    child.on("close", (code: number) => {
      clearTimeout(timer);
      if (timedOut) {
        console.error(`[aseprite] Timeout generating preview for ${sourcePath}`);
        return;
      }
      if (code === 0 && fs.existsSync(freshPath)) {
        console.log(`[aseprite] Preview generated: ${freshPath}`);
        // Copy fresh path to stable path for caching
        try {
          fs.copyFileSync(freshPath, stablePath);
          console.log(`[aseprite] Cached preview to stable path: ${stablePath}`);
        } catch (e) {
          console.error(`[aseprite] Failed to cache preview: ${e}`);
        }
        resolve(freshPath);
      } else {
        console.error(`[aseprite] Export failed with code ${code}`);
        resolve(null);
      }
    });
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
    
    let resolved = false;
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (resolved) return;
      if (err.code === "ENOENT") {
        reject(new Error(`Aseprite not found at: ${asepritePath}`));
      } else {
        reject(err);
      }
      resolved = true;
    });
    
    // Resolve immediately on successful spawn - don't wait for Aseprite to exit
    child.on("spawn", () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    });
    
    // Still track exit for logging but don't resolve/reject
    child.on("exit", (code: number) => {
      if (code !== 0) {
        console.warn(`[aseprite] Aseprite exited with code ${code}`);
      }
    });
  });
}