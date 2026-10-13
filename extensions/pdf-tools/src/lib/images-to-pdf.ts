import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const SUPPORTED_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".tiff",
  ".tif",
  ".webp",
  ".bmp",
  ".gif",
  ".ico",
  ".avif",
];

/**
 * Natural sort files according to their basename, e.g. [img1, img2, img10]
 */
export function naturalSort(files: string[]): string[] {
  return [...files].sort((a, b) =>
    path.basename(a).localeCompare(path.basename(b), undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );
}

/**
 * Python script to convert multiple images to a single PDF using Pillow.
 * Preserves resolution, handles EXIF orientation, and renders transparency over white background.
 */
const PYTHON_CONVERTER_SCRIPT = `
import sys
from PIL import Image, ImageOps

output_pdf = sys.argv[1]
input_images = sys.argv[2:]

processed_images = []

for file_path in input_images:
    try:
        im = Image.open(file_path)
        # Apply EXIF rotation if present
        try:
            im = ImageOps.exif_transpose(im)
        except Exception:
            pass

        # Handle RGBA/transparency by pasting on a clean white canvas
        if im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info):
            rgba = im.convert('RGBA')
            canvas = Image.new('RGB', rgba.size, (255, 255, 255))
            canvas.paste(rgba, mask=rgba.split()[3])
            processed_images.append(canvas)
        else:
            processed_images.append(im.convert('RGB'))
    except Exception as e:
        print(f"Error loading {file_path}: {e}", file=sys.stderr)
        raise

if not processed_images:
    sys.exit("No valid images could be processed")

processed_images[0].save(
    output_pdf,
    save_all=True,
    append_images=processed_images[1:],
    quality=95
)
`;

async function getPythonExecutable(): Promise<string> {
  const candidates =
    process.platform === "win32"
      ? ["python", "py", "python3"]
      : ["python3", "python"];

  for (const cmd of candidates) {
    try {
      await execFileAsync(cmd, ["--version"]);
      return cmd;
    } catch {
      // continue to next candidate
    }
  }
  return process.platform === "win32" ? "python" : "python3";
}

export async function convertImagesToPDF(
  imagePaths: string[],
  outputFilename: string
): Promise<string> {
  if (imagePaths.length === 0) {
    throw new Error("No images were selected for conversion");
  }

  // 1. Sort images naturally by filename
  const sortedImages = naturalSort(imagePaths);

  // 2. Determine target directory from first image
  const targetDir = path.dirname(sortedImages[0]);
  const safeFilename = outputFilename.toLowerCase().endsWith(".pdf")
    ? outputFilename
    : `${outputFilename}.pdf`;
  const outputPath = path.join(targetDir, safeFilename);

  // 3. Resolve python executable across platforms
  const pythonCmd = await getPythonExecutable();

  // 4. Execute python converter
  try {
    await execFileAsync(pythonCmd, [
      "-c",
      PYTHON_CONVERTER_SCRIPT,
      outputPath,
      ...sortedImages,
    ]);

    if (!fs.existsSync(outputPath)) {
      throw new Error("Target PDF was not generated");
    }

    return outputPath;
  } catch (err: any) {
    const errorDetails = err.stderr || err.message || String(err);
    if (errorDetails.includes("No module named 'PIL'") || errorDetails.includes("No module named PIL")) {
      throw new Error(
        "Pillow (PIL) is not installed. Please install it using 'pip install Pillow' to enable image conversion."
      );
    }
    if (errorDetails.includes("ENOENT") || errorDetails.includes("not found")) {
      throw new Error(
        "Python is not installed or not found in PATH. Please install Python and Pillow ('pip install Pillow')."
      );
    }
    throw new Error(`Failed to convert images to PDF: ${errorDetails}`);
  }
}
