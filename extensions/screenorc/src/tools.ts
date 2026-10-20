import { Clipboard, closeMainWindow, showHUD, LocalStorage } from "@vicinae/api";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ExecError = NodeJS.ErrnoException & { stderr?: string; status?: number; code?: string | number };

const missing = (cmd: string) => new Error(`${cmd} is not installed or not on PATH`);

export class MissingLanguageError extends Error {
	constructor(public lang: string, public pkgName: string) {
		super(`Missing language package '${pkgName}' for '${lang}'`);
	}
}

export async function captureRegion(outPath: string): Promise<boolean> {
	try {
		await run("spectacle", ["-r", "-b", "-n", "-o", outPath]);
	} catch (e) {
		const err = e as ExecError;
		if (err.code === "ENOENT") {
			throw missing("spectacle");
		}
		if (err.status === 1 || err.code === "1") {
			return false;
		}
		throw err;
	}

	let i = 0;
	while (i < 10) {
		let stat = null;
		try {
			stat = await fs.stat(outPath);
		} catch {
			stat = null;
		}

		if (stat) {
			if (stat.size > 0) {
				return true;
			}
		}
		await sleep(100);
		i++;
	}
	return false;
}

/** Runs Tesseract OCR with the selected storage language */
export async function runOcr(imagePath: string): Promise<string> {
	let lang = await LocalStorage.getItem<string>("selected_ocr_language");
	if (!lang) {
		lang = "eng";
	}

	try {
		const { stdout } = await run("tesseract", [imagePath, "stdout", "-l", lang], {
			maxBuffer: 16 * 1024 * 1024,
		});
		return stdout.trim();
	} catch (e) {
		const err = e as ExecError;
		if (err.code === "ENOENT") {
			throw missing("tesseract");
		}

		let stderr = err.message;
		if (err.stderr) {
			stderr = err.stderr.trim();
		}

		const isMissingData =
			stderr.includes("Error opening data file") ||
			stderr.includes("Failed loading language") ||
			stderr.includes("Cannot open input file");

		if (isMissingData) {
			const pkgSuffix = lang.replace("_", "-");
			const pkgName = `tesseract-data-${pkgSuffix}`;
			throw new MissingLanguageError(lang, pkgName);
		}

		throw new Error(stderr);
	}
}

/** Runs ZBar to scan QR codes or barcodes */
export async function runQrScan(imagePath: string): Promise<string> {
	try {
		const { stdout } = await run("zbarimg", ["--quiet", "--raw", imagePath], {
			maxBuffer: 16 * 1024 * 1024,
		});
		return stdout.trim();
	} catch (e) {
		const err = e as ExecError;
		if (err.code === "ENOENT") {
			throw missing("zbarimg");
		}

		let errOutput = err.message;
		if (err.stderr) {
			errOutput = err.stderr;
		}

		const isNoSymbols =
			errOutput.includes("no symbols found") || err.status === 4 || err.code === "4";

		if (isNoSymbols) {
			return "";
		}

		throw new Error(`ZBar failed: ${errOutput.trim()}`);
	}
}

/** Shared execution workflow for screen capture and clipboard copying */
export async function performScanAndCopy(
	processor: (imagePath: string) => Promise<string>,
	emptyMessage: string
) {
	const image = path.join(tmpdir(), `vicinae-scan-${randomUUID()}.png`);
	try {
		await closeMainWindow();
		await sleep(250);

		const captured = await captureRegion(image);
		if (!captured) {
			return;
		}

		const resultText = await processor(image);
		if (!resultText) {
			return showHUD(emptyMessage);
		}

		await Clipboard.copy(resultText);
		await showHUD("Copied to clipboard");
	} catch (error) {
		if (error instanceof MissingLanguageError) {
			await Clipboard.copy(error.pkgName);
			await showHUD(`Copied: ${error.pkgName}`);
		} else {
			let msg = String(error);
			if (error instanceof Error) {
				msg = error.message;
			}

			let shortMsg = msg;
			if (msg.length > 45) {
				shortMsg = msg.slice(0, 42) + "...";
			}
			await showHUD(`Scan failed: ${shortMsg}`);
		}
	} finally {
		await fs.rm(image, { force: true });
	}
}