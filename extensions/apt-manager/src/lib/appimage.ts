import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { AptPackage } from "./apt";

export type AppImageRemoveDepth = "file" | "desktop" | "config";

export interface AppImageInfo {
	name: string;
	path: string;
	version: string;
	description: string;
	icon: string | null;
	url: string | null;
	desktopPath: string | null;
	configDir: string | null;
}

function getApplicationsDir(): string {
	return join(homedir(), "Applications");
}

function parseDesktopFile(content: string): {
	name: string | null;
	comment: string | null;
	icon: string | null;
	exec: string | null;
} {
	let name: string | null = null;
	let comment: string | null = null;
	let icon: string | null = null;
	let exec: string | null = null;
	let inSection = false;
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "[Desktop Entry]") {
			inSection = true;
			continue;
		}
		if (!inSection || trimmed === "" || trimmed.startsWith("#")) continue;
		if (trimmed.startsWith("[") && trimmed.endsWith("]")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim().toLowerCase();
		const value = trimmed.slice(eq + 1).trim();
		switch (key) {
			case "name":
				name = value;
				break;
			case "comment":
				comment = value;
				break;
			case "icon":
				icon = value;
				break;
			case "exec":
				exec = value;
				break;
		}
	}
	return { name, comment, icon, exec };
}

function parseAppDataXml(content: string): {
	summary: string | null;
	description: string | null;
} {
	let summary: string | null = null;
	let description: string | null = null;
	const summaryMatch = content.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
	if (summaryMatch) summary = summaryMatch[1].trim();
	const descMatch = content.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
	if (descMatch) {
		const inner = descMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
		description = inner || null;
	}
	return { summary, description };
}

export async function discoverAppImageFile(
	dir: string,
): Promise<AppImageInfo | null> {
	const lowerName = basename(dir).toLowerCase();
	if (!lowerName.endsWith(".appimage")) return null;
	if (!existsSync(dir)) return null;

	const baseName = basename(dir, ".AppImage");
	const desktopPath = [
		join(dirname(dir), `${baseName}.desktop`),
		join(dirname(dir), `${baseName.toLowerCase()}.desktop`),
	].find((p) => existsSync(p)) ?? null;

	let name = baseName;
	let description = "";
	let icon: string | null = null;
	let url: string | null = null;

	if (desktopPath && existsSync(desktopPath)) {
		try {
			const parsed = parseDesktopFile(readFileSync(desktopPath, "utf8"));
			if (parsed.name) name = parsed.name;
			if (parsed.comment) description = parsed.comment;
			if (parsed.icon) icon = parsed.icon;
			if (parsed.exec) {
				const urlMatch = parsed.exec.match(/https?:\/\/[^\s"']+/);
				if (urlMatch) url = urlMatch[0];
			}
		} catch {
			// ignore parse errors
		}
	}

	let version = "";
	try {
		const appDataPath = join(dirname(desktopPath ?? ""), "appdata", `${baseName}.appdata.xml`);
		if (appDataPath && existsSync(appDataPath)) {
			const parsed = parseAppDataXml(readFileSync(appDataPath, "utf8"));
			if (parsed.summary) description = parsed.summary;
			if (parsed.description) {
				const verMatch = parsed.description.match(/(\d+\.(\d+\.)*\d+)/);
				if (verMatch) version = verMatch[1];
			}
		}
	} catch {
		// ignore
	}

	return {
		name,
		path: dir,
		version,
		description,
		icon,
		url,
		desktopPath,
		configDir: null,
	};
}

/**
 * Discover installed AppImages in ~/Applications and return them as AptPackage entries.
 */
export async function fetchAppImages(): Promise<AptPackage[]> {
	const appsDir = getApplicationsDir();
	if (!existsSync(appsDir)) return [];
	let entries: string[];
	try {
		entries = readdirSync(appsDir);
	} catch {
		return [];
	}
	const packages: AptPackage[] = [];
	for (const entry of entries) {
		const fullPath = join(appsDir, entry);
		if (!existsSync(fullPath)) continue;
		const info = await discoverAppImageFile(fullPath);
		if (!info) continue;
		packages.push({
			name: info.name,
			suite: "appimage",
			version: info.version || "unknown",
			arch: "",
			flags: {
				installed: true,
				automatic: false,
				upgradable: false,
				local: true,
			},
			current: null,
			description: info.description,
			manager: "appimage",
			icon: info.icon,
		});
	}
	return packages.sort((a, b) => a.name.localeCompare(b.name));
}

export async function installAppImage(
	source: { type: "url"; url: string } | { type: "file"; path: string },
): Promise<{ ok: boolean; error: string | null }> {
	const appsDir = getApplicationsDir();
	if (!existsSync(appsDir)) {
		try {
			mkdirSync(appsDir, { recursive: true });
		} catch {
			return { ok: false, error: `Failed to create ${appsDir}` };
		}
	}
	let targetPath: string;
	if (source.type === "url") {
		const url = source.url;
		const urlName = basename(url).split("?")[0] || "app.AppImage";
		targetPath = join(appsDir, urlName);
		try {
			const response = await fetch(url);
			if (!response.ok) {
				return { ok: false, error: `Download failed: ${response.status}` };
			}
			const buffer = await response.arrayBuffer();
			const bytes = Buffer.from(buffer);
			try {
				const { writeFileSync } = await import("node:fs");
				writeFileSync(targetPath, bytes);
			} catch {
				const fs = await import("node:fs");
				await new Promise<void>((resolve, reject) => {
					const stream = fs.createWriteStream(targetPath);
					stream.on("finish", () => resolve());
					stream.on("error", (e) => reject(e));
					stream.write(bytes);
					stream.end();
				});
			}
			try {
				chmodSync(targetPath, 0o755);
			} catch {
				// chmod may fail silently
			}
		} catch (err) {
			return {
				ok: false,
				error: `Download failed: ${err instanceof Error ? err.message : String(err)}`,
			};
		}
	} else {
		const srcPath = source.path;
		if (!existsSync(srcPath)) {
			return { ok: false, error: `File not found: ${srcPath}` };
		}
		targetPath = join(appsDir, basename(srcPath));
		try {
			copyFileSync(srcPath, targetPath);
			try {
				chmodSync(targetPath, 0o755);
			} catch {
				// chmod may fail silently
			}
		} catch (err) {
			return {
				ok: false,
				error: `Copy failed: ${err instanceof Error ? err.message : String(err)}`,
			};
		}
	}
	return { ok: true, error: null };
}

export async function removeAppImage(
	name: string,
	depth: AppImageRemoveDepth,
): Promise<{ ok: boolean; error: string | null }> {
	const appsDir = getApplicationsDir();
	if (!existsSync(appsDir)) {
		return { ok: false, error: "Applications directory not found" };
	}
	let targetPath: string | null = null;
	let targetName: string | null = null;
	for (const entry of readdirSync(appsDir)) {
		const fullPath = join(appsDir, entry);
		if (!existsSync(fullPath)) continue;
		try {
			const info = await discoverAppImageFile(fullPath);
			if (info && info.name === name) {
				targetPath = info.path;
				targetName = info.name;
				break;
			}
		} catch {
			continue;
		}
	}
	if (!targetPath || !targetName) {
		return { ok: false, error: `AppImage "${name}" not found` };
	}
	try {
		if (depth === "file" || depth === "desktop" || depth === "config") {
			rmSync(targetPath, { recursive: true, force: true });
		}
		if (depth === "desktop") {
			const desktopFile = targetPath.replace(/\.AppImage$/i, ".desktop");
			if (existsSync(desktopFile)) {
				rmSync(desktopFile, { force: true });
			}
		}
		if (depth === "config") {
			const configDir = join(homedir(), ".config", targetName);
			if (existsSync(configDir)) {
				rmSync(configDir, { recursive: true, force: true });
			}
		}
	} catch (err) {
		return {
			ok: false,
			error: `Remove failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
	return { ok: true, error: null };
}

export async function checkAppImageUpdate(
	name: string,
): Promise<{ ok: boolean; error: string | null; updateAvailable: boolean }> {
	const appsDir = getApplicationsDir();
	if (!existsSync(appsDir)) {
		return { ok: false, error: "Applications directory not found", updateAvailable: false };
	}
	let targetPath: string | null = null;
	let appUrl: string | null = null;
	for (const entry of readdirSync(appsDir)) {
		const fullPath = join(appsDir, entry);
		if (!existsSync(fullPath)) continue;
		try {
			const info = await discoverAppImageFile(fullPath);
			if (info && info.name === name) {
				targetPath = info.path;
				appUrl = info.url;
				break;
			}
		} catch {
			continue;
		}
	}
	if (!targetPath) {
		return { ok: false, error: `AppImage "${name}" not found`, updateAvailable: false };
	}
	let localMtime = 0;
	try {
		localMtime = statSync(targetPath).mtimeMs;
	} catch {
		// ignore
	}
	if (!appUrl) {
		return { ok: true, error: null, updateAvailable: false };
	}
	try {
		const response = await fetch(appUrl, { method: "HEAD" });
		if (!response.ok) {
			return { ok: true, error: null, updateAvailable: false };
		}
		const lastModified = response.headers.get("last-modified");
		if (lastModified) {
			const remoteTime = new Date(lastModified).getTime();
			return {
				ok: true,
				error: null,
				updateAvailable: remoteTime > localMtime,
			};
		}
	} catch {
		// ignore network errors
	}
	return { ok: true, error: null, updateAvailable: false };
}
