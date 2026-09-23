import { exec } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Escapes shell argument safely
 */
function escapeArg(arg: string): string {
  return `"${arg.replace(/(["\\$`])/g, "\\$1")}"`;
}

export function formatQpdfError(err: any): string {
  const msg = err.message || String(err);
  if (
    msg.includes("not found") ||
    msg.includes("is not recognized") ||
    err.code === 127 ||
    err.code === "ENOENT"
  ) {
    return "qpdf is not installed or not found in PATH. Please install qpdf ('sudo apt install qpdf' on Linux, 'brew install qpdf' on macOS, or 'winget install qpdf' on Windows).";
  }
  return msg;
}

/**
 * Check if PDF document is locked / password protected.
 * Exit code 0 from qpdf --is-encrypted indicates file is encrypted.
 * Exit code 2 indicates file is NOT encrypted.
 */
export async function isPDFDocumentLocked(filePath: string): Promise<boolean> {
  try {
    await execAsync(`qpdf --is-encrypted ${escapeArg(filePath)}`);
    return true; // Exit code 0: encrypted
  } catch (err: any) {
    if (err.code === 2) {
      return false; // Exit code 2: not encrypted
    }
    throw new Error(`Failed to inspect PDF: ${formatQpdfError(err)}`);
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
    await execAsync(
      `qpdf --requires-password --password=${escapeArg(password)} ${escapeArg(filePath)}`
    );
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
  const { stdout } = await execAsync(`qpdf --show-npages ${escapeArg(filePath)}`);
  const count = parseInt(stdout.trim(), 10);
  if (isNaN(count) || count <= 0) {
    throw new Error(`Could not determine page count for "${path.basename(filePath)}"`);
  }
  return count;
}

/**
 * Merge multiple PDF files into one.
 */
export async function mergePDFs(filePaths: string[], outputFilename: string): Promise<string> {
  if (filePaths.length < 2) {
    throw new Error("You must select at least two PDF files");
  }

  const outputDir = path.dirname(filePaths[0]);
  const safeFilename = outputFilename.toLowerCase().endsWith(".pdf")
    ? outputFilename
    : `${outputFilename}.pdf`;
  const outputPath = path.join(outputDir, safeFilename);

  const escapedInputs = filePaths.map((p) => escapeArg(p)).join(" ");
  const cmd = `qpdf --empty --pages ${escapedInputs} -- ${escapeArg(outputPath)}`;

  try {
    await execAsync(cmd);
    return outputPath;
  } catch (err: any) {
    throw new Error(`Failed to merge PDF files: ${formatQpdfError(err)}`);
  }
}

/**
 * Protect a PDF file with AES-256 password encryption in place.
 */
export async function protectPDF(filePath: string, password: string): Promise<void> {
  const cmd = `qpdf --encrypt ${escapeArg(password)} ${escapeArg(password)} 256 -- ${escapeArg(filePath)} --replace-input`;
  try {
    await execAsync(cmd);
  } catch (err: any) {
    throw new Error(`Failed to protect PDF "${path.basename(filePath)}": ${formatQpdfError(err)}`);
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

  const cmd = `qpdf --decrypt --password=${escapeArg(password)} ${escapeArg(filePath)} --replace-input`;
  try {
    await execAsync(cmd);
  } catch (err: any) {
    throw new Error(`Failed to unlock PDF "${path.basename(filePath)}": ${formatQpdfError(err)}`);
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
    const outPath = path.join(dir, outName);

    const cmd = `qpdf ${escapeArg(filePath)} --pages ${escapeArg(filePath)} ${start}-${stop} -- ${escapeArg(outPath)}`;
    await execAsync(cmd);

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
      await execAsync(
        `qpdf ${escapeArg(filePath)} --pages ${escapeArg(filePath)} ${start}-${start} -- ${escapeArg(tempPath)}`
      );
      const singlePageSize = fs.statSync(tempPath).size;

      if (singlePageSize >= maxSizeBytes || start === totalPages) {
        // Single page exceeds or is last page
        const outName = `${baseName} [${suffix} ${partNumber}].pdf`;
        const outPath = path.join(dir, outName);
        fs.renameSync(tempPath, outPath);
        outputFiles.push(outPath);
        start++;
        partNumber++;
        continue;
      }

      // Binary search for maximum number of pages fitting within maxSizeBytes
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        await execAsync(
          `qpdf ${escapeArg(filePath)} --pages ${escapeArg(filePath)} ${start}-${mid} -- ${escapeArg(tempPath)}`
        );
        const currentSize = fs.statSync(tempPath).size;

        if (currentSize <= maxSizeBytes) {
          bestStop = mid;
          low = mid + 1; // Try more pages
        } else {
          high = mid - 1; // Too big, reduce pages
        }
      }

      // Generate the final part with bestStop
      const outName = `${baseName} [${suffix} ${partNumber}].pdf`;
      const outPath = path.join(dir, outName);
      await execAsync(
        `qpdf ${escapeArg(filePath)} --pages ${escapeArg(filePath)} ${start}-${bestStop} -- ${escapeArg(outPath)}`
      );

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
