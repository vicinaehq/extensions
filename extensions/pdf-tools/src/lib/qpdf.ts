import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Sanitizes errors to ensure sensitive data (such as passwords) and raw command strings
 * are never leaked to user toasts, logs, or error messages.
 */
function sanitizeError(err: any, sensitive: string[] = []): string {
  let msg = "";
  if (err.stderr && typeof err.stderr === "string" && err.stderr.trim()) {
    msg = err.stderr.trim();
  } else if (err.message && typeof err.message === "string") {
    // Strip "Command failed: qpdf ..." lines
    const lines = err.message.split(/\r?\n/);
    const filtered = lines.filter((line: string) => !line.startsWith("Command failed:"));
    msg = filtered.join("\n").trim() || "An error occurred during operation";
  } else {
    msg = String(err);
  }

  if (
    msg.includes("not found") ||
    msg.includes("is not recognized") ||
    err.code === 127 ||
    err.code === "ENOENT"
  ) {
    return "qpdf is not installed or not found in PATH. Please install qpdf ('sudo apt install qpdf' on Linux, 'brew install qpdf' on macOS, or 'winget install qpdf' on Windows).";
  }

  // Redact any sensitive passwords or arguments
  for (const secret of sensitive) {
    if (secret && secret.length > 0) {
      msg = msg.split(secret).join("********");
    }
  }

  return msg;
}

/**
 * Executes qpdf with arguments safely without shell interpolation.
 */
async function runQpdf(
  args: string[],
  sensitive: string[] = []
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync("qpdf", args);
  } catch (err: any) {
    throw new Error(sanitizeError(err, sensitive));
  }
}

/**
 * Check if PDF document is locked / password protected.
 * Exit code 0 from qpdf --is-encrypted indicates file is encrypted.
 * Exit code 2 indicates file is NOT encrypted.
 */
export async function isPDFDocumentLocked(filePath: string): Promise<boolean> {
  try {
    await execFileAsync("qpdf", ["--is-encrypted", filePath]);
    return true; // Exit code 0: encrypted
  } catch (err: any) {
    if (err.code === 2) {
      return false; // Exit code 2: not encrypted
    }
    throw new Error(`Failed to inspect PDF: ${sanitizeError(err)}`);
  }
}

/**
 * Check if the provided password can unlock the PDF document.
 * Exit code 3 indicates correct password.
 * Exit code 0 indicates password required / wrong password.
 * Exit code 2 indicates file is not encrypted.
 */
export async function verifyPassword(filePath: string, password: string): Promise<boolean> {
  try {
    await execFileAsync("qpdf", [
      "--requires-password",
      `--password=${password}`,
      filePath,
    ]);
    return false;
  } catch (err: any) {
    if (err.code === 3 || err.code === 2) {
      return true;
    }
    return false;
  }
}

/**
 * Get total number of pages in a PDF document.
 */
export async function getPDFPageCount(filePath: string): Promise<number> {
  const { stdout } = await runQpdf(["--show-npages", filePath]);
  const count = parseInt(stdout.trim(), 10);
  if (isNaN(count) || count <= 0) {
    throw new Error(`Could not determine page count for "${path.basename(filePath)}"`);
  }
  return count;
}

/**
 * Generates a collision-free output file path if a file already exists.
 */
export function getUniqueFilePath(outputDir: string, safeFilename: string): string {
  const targetPath = path.join(outputDir, safeFilename);
  if (!fs.existsSync(targetPath)) {
    return targetPath;
  }
  const ext = path.extname(safeFilename);
  const base = path.basename(safeFilename, ext);
  let counter = 1;
  while (fs.existsSync(path.join(outputDir, `${base} (${counter})${ext}`))) {
    counter++;
  }
  return path.join(outputDir, `${base} (${counter})${ext}`);
}

/**
 * Merge multiple PDF files into one without overwriting existing files.
 */
export async function mergePDFs(filePaths: string[], outputFilename: string): Promise<string> {
  if (filePaths.length < 2) {
    throw new Error("You must select at least two PDF files");
  }

  const outputDir = path.dirname(filePaths[0]);
  const safeFilename = outputFilename.toLowerCase().endsWith(".pdf")
    ? outputFilename
    : `${outputFilename}.pdf`;
  const outputPath = getUniqueFilePath(outputDir, safeFilename);

  try {
    await runQpdf(["--empty", "--pages", ...filePaths, "--", outputPath]);
    return outputPath;
  } catch (err: any) {
    throw new Error(`Failed to merge PDF files: ${sanitizeError(err)}`);
  }
}

/**
 * Protect a PDF file with AES-256 password encryption in place.
 */
export async function protectPDF(filePath: string, password: string): Promise<void> {
  try {
    await runQpdf(
      ["--encrypt", password, password, "256", "--", filePath, "--replace-input"],
      [password]
    );
  } catch (err: any) {
    throw new Error(
      `Failed to protect PDF "${path.basename(filePath)}": ${sanitizeError(err, [password])}`
    );
  }
}

/**
 * Unlock a password-protected PDF file in place.
 */
export async function unlockPDF(filePath: string, password: string): Promise<void> {
  const isValid = await verifyPassword(filePath, password);
  if (!isValid) {
    throw new Error(`Incorrect password for "${path.basename(filePath)}"`);
  }

  try {
    await runQpdf(
      ["--decrypt", `--password=${password}`, filePath, "--replace-input"],
      [password]
    );
  } catch (err: any) {
    throw new Error(
      `Failed to unlock PDF "${path.basename(filePath)}": ${sanitizeError(err, [password])}`
    );
  }
}

/**
 * Split a PDF file by page count.
 */
export async function splitByPageCount(
  filePath: string,
  pageCount: number,
  suffix: string = "part"
): Promise<string[]> {
  const totalPages = await getPDFPageCount(filePath);
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);

  const outputFiles: string[] = [];
  let partNumber = 1;

  for (let start = 1; start <= totalPages; start += pageCount) {
    const stop = Math.min(start + pageCount - 1, totalPages);
    const outName = `${baseName} [${suffix} ${partNumber}].pdf`;
    const outPath = getUniqueFilePath(dir, outName);

    await runQpdf([filePath, "--pages", filePath, `${start}-${stop}`, "--", outPath]);

    outputFiles.push(outPath);
    partNumber++;
  }

  return outputFiles;
}

/**
 * Split a PDF file by file size in MB.
 */
export async function splitByFileSize(
  filePath: string,
  maxSizeMB: number,
  suffix: string = "part"
): Promise<string[]> {
  const maxSizeBytes = Math.round(maxSizeMB * 1_000_000);
  const totalPages = await getPDFPageCount(filePath);
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);

  const outputFiles: string[] = [];
  const tempPath = path.join(dir, `.temp_split_${Date.now()}.pdf`);

  let start = 1;
  let partNumber = 1;

  try {
    while (start <= totalPages) {
      let low = start;
      let high = totalPages;
      let bestStop = start;

      // First check if single page alone exceeds or fits
      await runQpdf([filePath, "--pages", filePath, `${start}-${start}`, "--", tempPath]);
      const singlePageSize = fs.statSync(tempPath).size;

      if (singlePageSize >= maxSizeBytes || start === totalPages) {
        const outName = `${baseName} [${suffix} ${partNumber}].pdf`;
        const outPath = getUniqueFilePath(dir, outName);
        fs.renameSync(tempPath, outPath);
        outputFiles.push(outPath);
        start++;
        partNumber++;
        continue;
      }

      // Binary search for maximum number of pages fitting within maxSizeBytes
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        await runQpdf([filePath, "--pages", filePath, `${start}-${mid}`, "--", tempPath]);
        const currentSize = fs.statSync(tempPath).size;

        if (currentSize <= maxSizeBytes) {
          bestStop = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      const outName = `${baseName} [${suffix} ${partNumber}].pdf`;
      const outPath = getUniqueFilePath(dir, outName);
      await runQpdf([filePath, "--pages", filePath, `${start}-${bestStop}`, "--", outPath]);

      outputFiles.push(outPath);
      start = bestStop + 1;
      partNumber++;
    }
  } finally {
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // ignore
      }
    }
  }

  return outputFiles;
}
