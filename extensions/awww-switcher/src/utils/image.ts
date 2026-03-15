import { opendir, readdir, readFile, stat } from "fs/promises";
import { createReadStream } from "fs";
import * as _path from "path";
import { imageSize } from "image-size";
import { LocalStorage as storage } from "@vicinae/api";
import { createHash } from "node:crypto";

const hyprpaperSupportedFormats = ["jpg", "jpeg", "png", "webp", "gif"];

export interface Image {
  name: string;
  fullpath: string;
  size: number;
  width: number;
  height: number;
  birthtime: string;
}

const parseImagesFromPath = async (path: string): Promise<string[]> => {
  try {
    // Recursively read all files in the directory and subdirectories
    const entries = await readdir(path, { recursive: true, withFileTypes: true });

    return entries
      .filter((entry) => {
        if (!entry.isFile()) return false;
        const ext = _path.extname(entry.name).toLowerCase().replace(".", "");
        return hyprpaperSupportedFormats.includes(ext);
      })
      .map((entry) => {
        const relativePath = _path.join(entry.parentPath.replace(path, ""), entry.name);
        return relativePath.startsWith("/") ? relativePath.slice(1) : relativePath;
      });
  } catch (e) {
    console.error(e);
    throw new Error("Failed to get images from provided path");
  }
};

const processImage = async (path: string): Promise<Image> => {
  try {
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const stream = createReadStream(path, { highWaterMark: 32768 });
      const chunks: Buffer[] = [];
      stream.on("data", (chunk) => chunks.push(chunk as Buffer));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });

    const dimensions = imageSize(buffer);
    if (!dimensions.width || !dimensions.height) {
      throw new Error("Invalid image dimensions");
    }

    const stats = await stat(path);
    return {
      width: dimensions.width,
      height: dimensions.height,
      birthtime: stats.birthtime.toLocaleString(),
      size: stats.size / (1024 * 1024),
      fullpath: path,
      name: _path.basename(path),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`⚠️ Skipping ${path}:`, message);
    const stats = await stat(path).catch(() => ({
      size: 0,
      birthtime: new Date(),
    }));
    return {
      width: 1920,
      height: 1080,
      birthtime: stats.birthtime.toLocaleString(),
      size: stats.size / (1024 * 1024),
      fullpath: path,
      name: _path.basename(path),
    };
  }
};

async function getPrevWallpapersHash(): Promise<string | undefined> {
  return storage.getItem("wallpapersHash");
}

async function getWallpapers(): Promise<string | undefined> {
  return storage.getItem("wallpapers") ?? "";
}

const getWallpapersHash = async (path: string): Promise<string> => {
  try {
    console.time("🚀 TOTAL HASH SPEED");
    const imagesPaths = await parseImagesFromPath(path);
    const hash = createHash("md5").update(imagesPaths.sort().join("\n")).digest("hex");
    console.timeEnd("🚀 TOTAL HASH SPEED");
    console.log("---");
    return hash;
  } catch (e) {
    console.error(e);
    throw new Error("Failed to get hash of wallpapers directory");
  }
}

// fetch images only if the source directory signature has changed and stores both the src dir signature and the wallpapers in LocalStorage
export const getImagesFromPath = async (path: string): Promise<Image[]> => {
  let results: Image[] = [];
  let previousWallpapersHash = await getPrevWallpapersHash();
  const currentWallpapersHash = await getWallpapersHash(path);

  if ((previousWallpapersHash == undefined) || (previousWallpapersHash != currentWallpapersHash)) {
    storage.setItem("wallpapersHash", currentWallpapersHash!);
    try {
      console.time("🚀 TOTAL SPEED");
      const imagesPaths = await parseImagesFromPath(path);
      console.log(`📁 Found ${imagesPaths.length} images`);

      const concurrencyLimit = 16; // 16 works for me, need feedback on slower machines


      for (let i = 0; i < imagesPaths.length; i += concurrencyLimit) {
        const batch = imagesPaths.slice(i, i + concurrencyLimit);
        const batchResults = await Promise.all(
          batch.map((img) => processImage(_path.join(path, img))),
        );
        results.push(...batchResults);
      }

      console.timeEnd("🚀 TOTAL SPEED");
      console.log("---"); // Werid buffer issue for timeend
    } catch (e) {
      console.error(e);
      throw new Error("Failed to get images from provided path");
    }
    storage.setItem("wallpapers", JSON.stringify(results));
  } else {
    results = JSON.parse(await getWallpapers() ?? "[]") as Image[];
  }

  return results;
};
