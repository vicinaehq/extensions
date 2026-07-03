import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { showToast } from "@vicinae/api";
import type { Preferences } from "./preferences";
import { expandPath } from "./preferences";
import { formatDateTokens } from "./dateFormat";

export const TEMP_PATH = path.join(os.tmpdir(), "vscrot_last.png");

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
	showToast({ title: "Saved", message: path.basename(destPath) });
};
