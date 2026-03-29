import { Clipboard } from "@vicinae/api";
import { execFile, spawn } from "child_process";
import fs from "fs/promises";
import { imageMeta } from "image-meta";
import os from "os";
import path from "path";
import { runAppleScript } from "run-applescript";
import util from "node:util";

type ImageMeta = {
  type: string;
  height: number;
  width: number;
};

export type LoadFrom = { data: Buffer; type: ImageMeta };

export type ClipboardHistoryImage = {
  id: string;
  data: Buffer;
  type: ImageMeta;
  mime: string;
  copiedAt: string;
  previewPath: string;
};

const execFileAsync = util.promisify(execFile);

const getType = async (data: Buffer, image: string): Promise<ImageMeta> => {
  const meta = await imageMeta(data);
  const type = meta.type ?? (path.extname(image).slice(1) || "png");
  const height = meta.height ?? 0;
  const width = meta.width ?? 0;
  return { type, height, width };
};

export const loadFromFinder = async (): Promise<LoadFrom | undefined> => {
  const selectedImages = await getSelectedImages();
  if (!selectedImages?.length) {
    return;
  }

  const image = selectedImages[0];
  const data = await fs.readFile(image);
  const type = await getType(data, image);

  return { data, type };
};

export const loadFromClipboard = async (): Promise<LoadFrom | undefined> => {
  // 1. Try the framework's file reference (works when clipboard contains a file path)
  try {
    const clipboardData = await Clipboard.read();

    if (clipboardData.file) {
      let image = decodeURIComponent(clipboardData.file);
      if (image.startsWith("file://")) {
        image = image.slice(7);
      }
      const data = await fs.readFile(image);
      const type = await getType(data, image);
      return { data, type };
    }

    // 2. Check if clipboard text is a file path to an image
    if (clipboardData.text && clipboardData.text.length < 1024) {
      let text = clipboardData.text.trim();
      if (text.startsWith("file://")) {
        text = text.slice(7);
      }
      try {
        await fs.access(text);
        const data = await fs.readFile(text);
        const type = await getType(data, text);
        return { data, type };
      } catch {
        // Not a valid file path, continue to fallback
      }
    }
  } catch {
    // Clipboard API failed, continue to fallback
  }

  // 3. Fallback: read raw image data from clipboard using system tools
  try {
    const data = await readClipboardImageData();
    if (data && data.length > 0) {
      const type = await getType(data, "clipboard.png");
      return { data, type };
    }
  } catch {
    // System tool fallback failed
  }

  return undefined;
};

/**
 * Reads raw binary output from a spawned process.
 */
function spawnBuffer(command: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.on("close", (code) => {
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
    proc.on("error", reject);
  });
}

/**
 * Reads clipboard image data using platform-specific system tools.
 * Handles the common case where the clipboard holds raw image data
 * (e.g. screenshots) rather than a file path reference.
 */
const readClipboardImageData = async (): Promise<Buffer | undefined> => {
  if (process.platform === "linux") {
    // Try Wayland (wl-paste) first, then X11 (xclip)
    try {
      return await spawnBuffer("wl-paste", ["--type", "image/png"]);
    } catch {
      // wl-paste not available or no image data
    }
    try {
      return await spawnBuffer("xclip", ["-selection", "clipboard", "-target", "image/png", "-o"]);
    } catch {
      // xclip not available or no image data
    }
  } else if (process.platform === "darwin") {
    const tmpFile = path.join(os.tmpdir(), `vicinae-clipboard-${Date.now()}.png`);
    try {
      await execFileAsync("pngpaste", [tmpFile]);
      const data = await fs.readFile(tmpFile);
      await fs.unlink(tmpFile).catch(() => {});
      return data;
    } catch {
      await fs.unlink(tmpFile).catch(() => {});
    }
  } else if (process.platform === "win32") {
    const tmpFile = path.join(os.tmpdir(), `vicinae-clipboard-${Date.now()}.png`);
    try {
      await execFileAsync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Add-Type -AssemblyName System.Windows.Forms; $img = [System.Windows.Forms.Clipboard]::GetImage(); if ($img) { $img.Save('${tmpFile}', [System.Drawing.Imaging.ImageFormat]::Png) } else { exit 1 }`,
        ],
        { windowsHide: true },
      );
      const data = await fs.readFile(tmpFile);
      await fs.unlink(tmpFile).catch(() => {});
      return data;
    } catch {
      await fs.unlink(tmpFile).catch(() => {});
    }
  }
  return undefined;
};

/**
 * Spawns a process, writes input to its stdin, and collects binary stdout.
 */
function spawnBufferWithInput(command: string, args: string[], input: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.on("close", (code) => {
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
    proc.on("error", reject);
    proc.stdin.write(input);
    proc.stdin.end();
  });
}

const PREVIEW_DIR = path.join(os.tmpdir(), "vicinae-clipboard-previews");

/**
 * Loads clipboard history images using platform-specific clipboard history tools.
 * On Linux/Wayland, uses cliphist. Falls back to the current clipboard image.
 */
export const loadClipboardHistoryImages = async (limit = 20): Promise<ClipboardHistoryImage[]> => {
  const images: ClipboardHistoryImage[] = [];

  await fs.mkdir(PREVIEW_DIR, { recursive: true });

  if (process.platform === "linux") {
    try {
      const { stdout } = await execFileAsync("cliphist", ["list"], { maxBuffer: 10 * 1024 * 1024 });
      const allLines = stdout.split("\n");
      const imageLines = allLines.filter(
        (line) => line.includes("[[ binary data") && /image|png|jpg|jpeg|gif|webp|bmp/i.test(line),
      );

      // Build a map of cliphist ID → overall position in history for copy time estimation
      const allIds = allLines.filter((l) => l.trim()).map((l) => l.split("\t")[0].trim());

      for (const line of imageLines.slice(0, limit)) {
        try {
          const id = line.split("\t")[0].trim();
          const data = await spawnBufferWithInput("cliphist", ["decode"], line + "\n");
          if (data && data.length > 0) {
            const type = await getType(data, "clipboard.png");
            const mime = `image/${type.type.toLowerCase()}`;
            const position = allIds.indexOf(id);
            const copiedAt = position === 0 ? "Latest" : `${position + 1} copies ago`;
            const previewPath = path.join(PREVIEW_DIR, `${id}.png`);
            await fs.writeFile(previewPath, data);
            images.push({ id, data, type, mime, copiedAt, previewPath });
          }
        } catch {
          // Skip entries that fail to decode
        }
      }
    } catch {
      // cliphist not available
    }
  }

  // Fallback: if no history images found, try current clipboard
  if (images.length === 0) {
    try {
      const data = await loadFromClipboard();
      if (data) {
        const mime = `image/${data.type.type.toLowerCase()}`;
        const previewPath = path.join(PREVIEW_DIR, "current.png");
        await fs.writeFile(previewPath, data.data);
        images.push({ id: "current", ...data, mime, copiedAt: "Current", previewPath });
      }
    } catch {
      // Failed to load current clipboard
    }
  }

  return images;
};

const getSelectedImages = async (): Promise<string[]> => {
  if (process.platform === "win32") {
    return getExplorerSelectedImages();
  }
  return getFinderSelectedImages();
};

/**
 * Gets currently selected images in Finder (macOS).
 *
 * @returns A promise resolving to the comma-separated list of images as a string.
 */
const getFinderSelectedImages = async (): Promise<string[]> => {
  const result = await runAppleScript(
    `\
set imageTypes to {"PNG", "JPG", "JPEG", "TIF", "HEIF", "GIF", "ICO", "ICNS", "ASTC", "BMP", "DDS", "EXR", "JP2", "KTX", "Portable Bitmap", "Adobe Photoshop", "PVR", "TGA", "WebP", "SVG", "PDF", "HEIC"}

tell application "Finder"
  set theSelection to selection
  if theSelection is {} then
    return
  else if (theSelection count) is equal to 1 then
    repeat with imageType in imageTypes
      if (kind of the first item of theSelection) contains imageType then
        return the POSIX path of (theSelection as alias)
        exit repeat
      end if
    end repeat
  else
    set thePaths to {}
    repeat with i from 1 to (theSelection count)
      repeat with imageType in imageTypes
        if (kind of (item i of theSelection)) contains imageType then
          copy (POSIX path of (item i of theSelection as alias)) to end of thePaths
          exit repeat
        end if
      end repeat
    end repeat
    return thePaths
  end if
end tell`,
  );
  return result.split(/,\s+/g).filter((item) => !!item);
};

/**
 * Gets currently selected images in Windows Explorer.
 * Falls back to an empty array if no selection or an error occurs.
 */
const getExplorerSelectedImages = async (): Promise<string[]> => {
  if (process.platform !== "win32") {
    return [];
  }

  const psScript = `
  $shell = New-Object -ComObject Shell.Application
  $selected = @()
  foreach ($window in $shell.Windows()) {
    try {
      $doc = $window.Document
      if ($doc -and $doc.SelectedItems()) {
        foreach ($item in $doc.SelectedItems()) {
          $selected += $item.Path
        }
      }
    } catch {}
  }
  $selected -join [Environment]::NewLine
  `;

  try {
    const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-Command", psScript], {
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter((item) => !!item);
  } catch (error) {
    console.error("Failed to read selection from Explorer", error);
    return [];
  }
};
