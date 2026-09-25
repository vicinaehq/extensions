import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { run } from "./exec";
import type { AptPackage } from "./apt";

export type AppImageRemoveDepth = "file" | "desktop" | "config";

export interface AppImageManifest {
	url: string | null;
	installedAt: string;
}

export interface AppImageInfo {
	/** On-disk filename of the AppImage (unique identity). */
	fileName: string;
	/** Display name (from the embedded desktop/metainfo, else the filename). */
	name: string;
	/** Full path to the AppImage file. */
	path: string;
	version: string;
	description: string;
	/** Absolute path to an extracted PNG icon, or null if unavailable. */
	icon: string | null;
	url: string | null;
	desktopPath: string | null;
}

const EXTRACT_TIMEOUT = 180_000;

function getApplicationsDir(): string {
	return join(homedir(), "Applications");
}

function getUserDesktopDir(): string {
	return join(homedir(), ".local", "share", "applications");
}

function getSidecarDir(appPath: string): string {
	return `${appPath}.d`;
}

function getManifestPath(appPath: string): string {
	return join(getSidecarDir(appPath), "manifest.json");
}

export function parseVersionFromFileName(fileName: string): string {
	const base = fileName.replace(/\.appimage$/i, "");
	const match = base.match(/(\d+\.\d+(?:\.\d+)*)/);
	return match ? match[1] : "";
}

function readManifest(appPath: string): Partial<AppImageManifest> | null {
	const manifestPath = getManifestPath(appPath);
	if (!existsSync(manifestPath)) return null;
	try {
		const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as Partial<AppImageManifest>;
		return typeof raw === "object" && raw !== null ? raw : null;
	} catch {
		return null;
	}
}

function writeManifest(
	appPath: string,
	manifest: AppImageManifest,
): void {
	writeFileSync(getManifestPath(appPath), `${JSON.stringify(manifest, null, 2)}\n`);
}

function parseDesktopFile(content: string): {
	name: string | null;
	comment: string | null;
} {
	let name: string | null = null;
	let comment: string | null = null;
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
		if (key === "name") name = value;
		if (key === "comment") comment = value;
	}
	return { name, comment };
}

function parseAppDataXml(content: string): {
	summary: string | null;
	description: string | null;
	url: string | null;
} {
	let summary: string | null = null;
	let description: string | null = null;
	let url: string | null = null;
	const summaryMatch = content.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
	if (summaryMatch) summary = summaryMatch[1].trim();
	const descMatch = content.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
	if (descMatch) {
		const inner = descMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
		description = inner || null;
	}
	const urlMatch =
		content.match(/<url[^>]*type="homepage"[^>]*>\s*([^<]+?)\s*<\/url>/i) ??
		content.match(/<url[^>]*>\s*([^<]+?)\s*<\/url>/i);
	if (urlMatch) url = urlMatch[1].trim();
	return { summary, description, url };
}

function readPngDimensions(buffer: Buffer): { width: number; height: number } | null {
	if (buffer.length < 24 || buffer.readUInt32BE(12) !== 0x49484452) return null;
	return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** Find the largest PNG under the icon resource directories of an extracted AppImage. */
function pickLargestIcon(root: string): string | null {
	let best: string | null = null;
	let bestArea = 0;
	const scan = (dir: string) => {
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = join(dir, entry);
			let isDirectory = false;
			let isFile = false;
			try {
				const stat = statSync(full);
				isDirectory = stat.isDirectory();
				isFile = stat.isFile();
			} catch {
				continue;
			}
			if (isDirectory) {
				scan(full);
			} else if (isFile && entry.toLowerCase().endsWith(".png")) {
				let buffer: Buffer;
				try {
					buffer = readFileSync(full);
				} catch {
					continue;
				}
				const dims = readPngDimensions(buffer);
				if (dims) {
					const area = dims.width * dims.height;
					if (area > bestArea) {
						bestArea = area;
						best = full;
					}
				}
			}
		}
	};
	scan(join(root, "usr", "share", "icons"));
	scan(join(root, "usr", "share", "pixmaps"));
	if (best) return best;
	const dirIcon = join(root, ".DirIcon");
	if (existsSync(dirIcon)) {
		try {
			const resolved = realpathSync(dirIcon);
			if (resolved.toLowerCase().endsWith(".png") && statSync(resolved).isFile()) {
				return resolved;
			}
		} catch {
			// ignore
		}
	}
	return null;
}

function findRootDesktop(root: string): string | null {
	let entries: string[];
	try {
		entries = readdirSync(root);
	} catch {
		return null;
	}
	for (const entry of entries) {
		if (entry.startsWith(".") || !entry.endsWith(".desktop")) continue;
		const full = join(root, entry);
		try {
			if (statSync(full).isFile()) return full;
		} catch {
			// ignore
		}
	}
	return null;
}

function findMetaInfo(root: string): string | null {
	for (const dir of [join(root, "usr", "share", "metainfo"), join(root, "usr", "share", "appdata")]) {
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (/\.(metainfo|appdata)\.xml$/i.test(entry)) {
				const full = join(dir, entry);
				if (statSync(full).isFile()) return full;
			}
		}
	}
	return null;
}

/**
 * Best-effort metadata extraction: run the AppImage's embedded runtime, then
 * persist the .desktop, metainfo, icon and a manifest into the sidecar.
 * Never fails the install and never leaves temp files behind.
 * Resolves true if usable metadata was extracted (icon, name or metainfo).
 */
async function extractAppImageSidecar(appPath: string): Promise<boolean> {
	const sidecar = getSidecarDir(appPath);
	const fileName = basename(appPath);
	const baseName = fileName.replace(/\.appimage$/i, "");
	const tempDir = mkdtempSync(join(tmpdir(), "appimage-extract-"));
	try {
		const result = await run(appPath, ["--appimage-extract"], {
			cwd: tempDir,
			timeout: EXTRACT_TIMEOUT,
		});
		if (!result.ok) return false;
		const root = join(tempDir, "squashfs-root");
		if (!existsSync(root)) return false;

		let name: string | null = null;
		let comment: string | null = null;
		let description: string | null = null;
		let metaUrl: string | null = null;
		let metaInfoPath: string | null = null;

		const desktopFile = findRootDesktop(root);
		if (desktopFile) {
			const parsed = parseDesktopFile(readFileSync(desktopFile, "utf8"));
			name = parsed.name;
			comment = parsed.comment;
		}
		metaInfoPath = findMetaInfo(root);
		if (metaInfoPath) {
			const xml = readFileSync(metaInfoPath, "utf8");
			const parsed = parseAppDataXml(xml);
			if (parsed.summary) description = parsed.summary;
			if (parsed.description) description = parsed.description;
			if (parsed.url) metaUrl = parsed.url;
		}
		const iconSrc = pickLargestIcon(root);

		if (!iconSrc && !name && !comment && !metaInfoPath) return false;

		mkdirSync(sidecar, { recursive: true });
		let iconPath: string | null = null;
		if (iconSrc) {
			iconPath = join(sidecar, `icon${extname(iconSrc).toLowerCase()}`);
			copyFileSync(iconSrc, iconPath);
		}
		if (metaInfoPath) {
			copyFileSync(metaInfoPath, join(sidecar, "app.metainfo.xml"));
		}
		writeFileSync(
			join(sidecar, "app.desktop"),
			buildDesktopContent(appPath, baseName, {
				name: name || baseName,
				description: comment || description || "",
				icon: iconPath,
			}),
		);
		writeManifest(appPath, {
			url: metaUrl,
			installedAt: new Date().toISOString(),
		});
		return true;
	} catch {
		// best-effort
		return false;
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

function buildDesktopContent(
	appPath: string,
	baseName: string,
	info: Pick<AppImageInfo, "name" | "description" | "icon">,
): string {
	const exec = appPath.includes(" ") ? `"${appPath}"` : appPath;
	const lines = [
		"[Desktop Entry]",
		"Type=Application",
		`Name=${info.name || baseName}`,
		`Exec=${exec}`,
		`Icon=${info.icon || baseName}`,
		"Terminal=false",
		"Categories=Utility;",
	];
	if (info.description) lines.push(`Comment=${info.description}`);
	return `${lines.join("\n")}\n`;
}

export async function discoverAppImageFile(
	dir: string,
): Promise<AppImageInfo | null> {
	const fileName = basename(dir);
	if (!fileName.toLowerCase().endsWith(".appimage")) return null;
	try {
		if (!statSync(dir).isFile()) return null;
	} catch {
		return null;
	}

	const baseName = fileName.replace(/\.appimage$/i, "");
	const sidecar = getSidecarDir(dir);
	const sidecarExists = existsSync(sidecar);

	let name = baseName;
	let description = "";
	let icon: string | null = null;
	let url: string | null = null;
	let desktopPath: string | null = null;

	if (sidecarExists) {
		const manifest = readManifest(dir);
		if (manifest?.url) url = manifest.url;
		const sideDesktop = join(sidecar, "app.desktop");
		if (existsSync(sideDesktop)) {
			desktopPath = sideDesktop;
			try {
				const parsed = parseDesktopFile(readFileSync(sideDesktop, "utf8"));
				if (parsed.name) name = parsed.name;
				if (parsed.comment) description = parsed.comment;
			} catch {
				// ignore parse errors
			}
		}
		const sideMeta = join(sidecar, "app.metainfo.xml");
		if (existsSync(sideMeta)) {
			try {
				const parsed = parseAppDataXml(readFileSync(sideMeta, "utf8"));
				if (parsed.summary) description = parsed.summary;
				if (parsed.description) description = parsed.description;
				if (parsed.url && !url) url = parsed.url;
			} catch {
				// ignore parse errors
			}
		}
		const iconPng = join(sidecar, "icon.png");
		const iconSvg = join(sidecar, "icon.svg");
		if (existsSync(iconPng)) icon = iconPng;
		else if (existsSync(iconSvg)) icon = null;
	}

	if (!desktopPath) {
		const siblingDesktop = join(dirname(dir), `${baseName}.desktop`);
		if (existsSync(siblingDesktop)) {
			desktopPath = siblingDesktop;
			try {
				const parsed = parseDesktopFile(readFileSync(siblingDesktop, "utf8"));
				if (parsed.name) name = parsed.name;
				if (parsed.comment) description = parsed.comment;
			} catch {
				// ignore parse errors
			}
		}
	}

	return {
		fileName,
		name,
		path: dir,
		version: parseVersionFromFileName(fileName),
		description,
		icon,
		url,
		desktopPath,
	};
}

/**
 * Discover installed AppImages in ~/Applications and return them as AptPackage entries.
 */
export async function fetchAppImages(): Promise<AptPackage[]> {
	const appsDir = getApplicationsDir();
	if (!existsSync(appsDir)) return [];
	const packages: AptPackage[] = [];
	for (const entry of readdirSync(appsDir)) {
		if (!entry.toLowerCase().endsWith(".appimage")) continue;
		const fullPath = join(appsDir, entry);
		const info = await discoverAppImageFile(fullPath);
		if (!info) continue;
		packages.push({
			name: info.name,
			fileName: info.fileName,
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

export type AppImageInstallResult = {
	ok: boolean;
	error: string | null;
	targetPath?: string;
	info?: AppImageInfo;
	hasMetadata?: boolean;
};

/**
 * Install an AppImage from a local file by copying it into ~/Applications and
 * extracting its icon/metadata into a sidecar directory. Downloads are not
 * performed by this extension; users obtain the AppImage themselves.
 */
export async function installAppImage(
	path: string,
): Promise<AppImageInstallResult> {
	const appsDir = getApplicationsDir();
	if (!existsSync(appsDir)) {
		try {
			mkdirSync(appsDir, { recursive: true });
		} catch {
			return { ok: false, error: `Failed to create ${appsDir}` };
		}
	}
	if (!existsSync(path)) {
		return { ok: false, error: `File not found: ${path}` };
	}
	const targetPath = join(appsDir, basename(path));
	try {
		copyFileSync(path, targetPath);
		chmodSync(targetPath, 0o755);
	} catch (err) {
		return {
			ok: false,
			error: `Copy failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}

	const hasMetadata = await extractAppImageSidecar(targetPath);
	const info = await discoverAppImageFile(targetPath);
	return {
		ok: true,
		error: null,
		targetPath,
		info: info ?? undefined,
		hasMetadata,
	};
}

/**
 * Create a .desktop file for an AppImage in the specified location.
 */
export async function installDesktopFile(
	appPath: string,
	location: "user" | "system",
	info?: AppImageInfo,
): Promise<{ ok: boolean; error: string | null }> {
	const baseName = basename(appPath).replace(/\.appimage$/i, "");
	const infoForEntry: Pick<AppImageInfo, "name" | "description" | "icon"> = {
		name: info?.name ?? baseName,
		description: info?.description ?? "",
		icon: info?.icon ?? null,
	};
	const desktopContent = buildDesktopContent(appPath, baseName, infoForEntry);
	let desktopPath: string;

	if (location === "user") {
		const desktopDir = getUserDesktopDir();
		if (!existsSync(desktopDir)) {
			try {
				mkdirSync(desktopDir, { recursive: true });
			} catch (err) {
				return {
					ok: false,
					error: `Failed to create ${desktopDir}: ${err instanceof Error ? err.message : String(err)}`,
				};
			}
		}
		desktopPath = join(desktopDir, `${baseName}.desktop`);
		try {
			writeFileSync(desktopPath, desktopContent);
		} catch (err) {
			return {
				ok: false,
				error: `Failed to write desktop file: ${err instanceof Error ? err.message : String(err)}`,
			};
		}
	} else {
		desktopPath = join("/usr/share/applications", `${baseName}.desktop`);
		const result = await run("pkexec", ["tee", desktopPath], {
			input: desktopContent,
			timeout: 30_000,
		});
		if (!result.ok) {
			return {
				ok: false,
				error: result.stderr.trim() || result.stdout.trim() || "Failed to write desktop file",
			};
		}
	}
	return { ok: true, error: null };
}

export async function removeAppImage(
	fileName: string,
	depth: AppImageRemoveDepth,
): Promise<{ ok: boolean; error: string | null }> {
	const appsDir = getApplicationsDir();
	if (!existsSync(appsDir)) {
		return { ok: false, error: "Applications directory not found" };
	}
	let targetPath: string | null = null;
	for (const entry of readdirSync(appsDir)) {
		if (!entry.toLowerCase().endsWith(".appimage")) continue;
		if (entry === fileName || entry.toLowerCase() === fileName.toLowerCase()) {
			targetPath = join(appsDir, entry);
			break;
		}
	}
	if (!targetPath) {
		return { ok: false, error: `AppImage "${fileName}" not found` };
	}
	const baseName = basename(targetPath).replace(/\.appimage$/i, "");
	const sysDesktop = join("/usr/share/applications", `${baseName}.desktop`);
	if (
		(depth === "desktop" || depth === "config") &&
		existsSync(sysDesktop)
	) {
		const result = await run("pkexec", ["rm", "-f", sysDesktop], {
			timeout: 60_000,
		});
		if (!result.ok) {
			return {
				ok: false,
				error:
					result.stderr.trim() ||
					result.stdout.trim() ||
					"Failed to remove the system desktop entry",
			};
		}
	}
	try {
		rmSync(targetPath, { recursive: true, force: true });
		rmSync(getSidecarDir(targetPath), { recursive: true, force: true });
		if (depth === "desktop" || depth === "config") {
			const siblingDesktop = join(appsDir, `${baseName}.desktop`);
			if (existsSync(siblingDesktop)) rmSync(siblingDesktop, { force: true });
			const userDesktop = join(getUserDesktopDir(), `${baseName}.desktop`);
			if (existsSync(userDesktop)) rmSync(userDesktop, { force: true });
		}
		if (depth === "config") {
			const configDir = join(homedir(), ".config", baseName);
			if (existsSync(configDir)) rmSync(configDir, { recursive: true, force: true });
		}
	} catch (err) {
		return {
			ok: false,
			error: `Remove failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
	return { ok: true, error: null };
}