import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { showToast } from "@vicinae/api";
import type { Preferences } from "./preferences";
import { expandPath } from "./preferences";
import { formatDateTokens } from "./dateFormat";

// Each command process captures into its own 0700 directory created by
// mkdtemp, so a screenshot is never written to a predictable shared path that
// other users on the machine can read or race.
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "vscrot-"));
export const TEMP_PATH = path.join(TEMP_DIR, "capture.png");

/** Removes the pending capture. Safe to call when nothing was captured. */
export const removeTempCapture = (): void => {
	try {
		fs.rmSync(TEMP_PATH, { force: true });
	} catch (e) {
		console.error("Failed to remove temporary capture", e);
	}
};

process.on("exit", () => {
	try {
		fs.rmSync(TEMP_DIR, { recursive: true, force: true });
	} catch {
		// The process is exiting; there is nothing useful left to do.
	}
});

export const getSavePath = (
	prefs: Preferences,
	customFilename?: string,
): string => {
	const base = expandPath(prefs.screenshot_path || "~/Pictures/Screenshots");
	const subfolder = prefs.subfolder_format
		? formatDateTokens(prefs.subfolder_format)
		: "";
	const filename = customFilename || formatDateTokens(prefs.filename_format);
	return path.join(base, subfolder, `${filename}.png`);
};

export const loadRecentFiles = (saveDirBase: string): string[] => {
	if (!fs.existsSync(saveDirBase)) return [];
	try {
		const allFiles: { path: string; mtime: number }[] = [];
		const walk = (dir: string) => {
			if (!fs.existsSync(dir)) return;
			for (const item of fs.readdirSync(dir)) {
				const fullPath = path.join(dir, item);
				const stat = fs.statSync(fullPath);
				if (stat.isDirectory()) {
					walk(fullPath);
				} else if (item.endsWith(".png") || item.endsWith(".jpg")) {
					allFiles.push({ path: fullPath, mtime: stat.mtimeMs });
				}
			}
		};
		walk(saveDirBase);
		return allFiles
			.sort((a, b) => b.mtime - a.mtime)
			.slice(0, 20)
			.map((f) => f.path);
	} catch (e) {
		console.error("Failed to load recent files", e);
		return [];
	}
};

export const saveImageFile = (sourcePath: string, destPath: string): void => {
	const dir = path.dirname(destPath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.copyFileSync(sourcePath, destPath);
	if (sourcePath === TEMP_PATH) removeTempCapture();
	showToast({ title: "Saved", message: path.basename(destPath) });
};
