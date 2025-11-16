import { opendir, readdir, readFile, stat } from "fs/promises";
import { createReadStream } from "fs";
import * as _path from "path";
import { imageSize } from "image-size";

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
    const wallpapers = await readdir(path);
    return wallpapers.filter((w) =>
      hyprpaperSupportedFormats.includes(
        _path.extname(w).toLowerCase().replace(".", ""),
      ),
    );
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
    console.error(`⚠️ Skipping ${path}:`, e.message);
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

export const getImagesFromPath = async (path: string): Promise<Image[]> => {
  try {
    console.time("🚀 TOTAL SPEED");
    const imagesPaths = await parseImagesFromPath(path);
    console.log(`📁 Found ${imagesPaths.length} images`);

    const concurrencyLimit = 16; // 16 works for me, need feedback on slower machines

    const results: Image[] = [];

    for (let i = 0; i < imagesPaths.length; i += concurrencyLimit) {
      const batch = imagesPaths.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.all(
        batch.map((img) => processImage(_path.join(path, img))),
      );
      results.push(...batchResults);
    }

    console.timeEnd("🚀 TOTAL SPEED");
    console.log("---"); // Werid buffer issue for timeend
    return results;
  } catch (e) {
    console.error(e);
    throw new Error("Failed to get images from provided path");
  }
};
