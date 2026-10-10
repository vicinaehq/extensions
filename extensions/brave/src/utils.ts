import { existsSync, readdirSync, readFileSync } from "node:fs";
import { delimiter, homedir } from "node:os";
import path from "node:path";
import { getPreferenceValues, Icon, type ImageLike } from "@vicinae/api";
import initSqlJs, { Database } from "sql.js";

export type BraveVariant = "brave" | "brave-origin";

export type BraveVariantInfo = {
	id: BraveVariant;
	name: string;
	binaries: string[];
	flagsFile: string;
	openScheme: string;
	dataDir: string;
};

type BravePreferences = {
	profile_dir?: string;
	browser_variant?: string;
};

const preferences = getPreferenceValues<BravePreferences>();

export const BRAVE_VARIANTS: BraveVariantInfo[] = [
	{
		id: "brave",
		name: "Brave",
		binaries: ["brave-browser", "brave-browser-stable", "brave"],
		flagsFile: "brave-browser-flags.conf",
		openScheme: "brave",
		dataDir: path.join("BraveSoftware", "Brave-Browser"),
	},
	{
		id: "brave-origin",
		name: "Brave Origin",
		binaries: ["brave-origin"],
		flagsFile: "brave-origin-flags.conf",
		openScheme: "brave-origin",
		dataDir: path.join("BraveSoftware", "Brave-Origin"),
	},
];

export function variantName(variant: BraveVariant): string {
	return BRAVE_VARIANTS.find((v) => v.id === variant)?.name ?? "Brave";
}

export function variantInfo(variant: BraveVariant): BraveVariantInfo {
	return BRAVE_VARIANTS.find((v) => v.id === variant) ?? BRAVE_VARIANTS[0];
}

export function dataDirForVariant(variant: BraveVariant): string {
	const custom = preferences.profile_dir?.trim();
	return path.join(homedir(), custom ?? path.join(".config", variantInfo(variant).dataDir));
}

export function findOnPath(candidate: string): string | undefined {
	for (const dir of (process.env.PATH ?? "").split(delimiter)) {
		if (!dir) continue;
		try {
			const full = path.join(dir, candidate);
			if (existsSync(full)) return full;
		} catch {
		}
	}
	return undefined;
}

export function isVariantInstalled(variant: BraveVariant): boolean {
	const dir = dataDirForVariant(variant);
	if (existsSync(path.join(dir, "Bookmarks")) || existsSync(path.join(dir, "History"))) return true;
	return variantInfo(variant).binaries.some((b) => findOnPath(b) !== undefined);
}

export function isBraveRunning(variant: BraveVariant): boolean {
	return existsSync(path.join(dataDirForVariant(variant), "SingletonLock"));
}

export function detectVariant(): BraveVariant | undefined {
	const preferred = preferences.browser_variant;
	if (preferred === "brave" || preferred === "brave-origin") return preferred;

	const installed = BRAVE_VARIANTS.filter((v) => isVariantInstalled(v.id)).map((v) => v.id);
	if (installed.length === 1) return installed[0];
	if (installed.length > 1) return installed.find((id) => isBraveRunning(id)) ?? "brave";
	return undefined;
}

export type Profile = { name: string; path: string };

export function getBraveProfiles(variant: BraveVariant): { profiles: Profile[]; defaultProfile: string } {
	const profiles: Profile[] = [];
	const dataDir = dataDirForVariant(variant);

	if (!existsSync(dataDir)) {
		return { profiles, defaultProfile: "" };
	}

	for (const entry of readdirSync(dataDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const profilePath = path.join(dataDir, entry.name);
		if (existsSync(path.join(profilePath, "Bookmarks")) || existsSync(path.join(profilePath, "History"))) {
			profiles.push({ name: entry.name, path: entry.name });
		}
	}

	const defaultProfile = profiles.find((p) => p.name === "Default")?.path ?? profiles[0]?.path ?? "";
	return { profiles, defaultProfile };
}

export async function openSqliteDb(dbPath: string): Promise<Database> {
	if (!existsSync(dbPath)) {
		throw new Error(`Database not found: ${dbPath}`);
	}

	const buffer = readFileSync(dbPath);
	const SQL = await initSqlJs({
		locateFile: () => path.resolve(__dirname, "assets/sql-wasm.wasm"),
	});

	return new SQL.Database(new Uint8Array(buffer));
}

export async function openHistoryDb(variant: BraveVariant, profilePath: string): Promise<Database> {
	return openSqliteDb(path.join(dataDirForVariant(variant), profilePath, "History"));
}

export function extractHost(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return "";
	}
}

export function getFavicon(url: string, fallback: Icon): ImageLike {
	try {
		const host = new URL(url).hostname;
		if (!host) return fallback;
		return { source: `https://www.google.com/s2/favicons?domain=${host}&sz=32`, fallback };
	} catch {
		return fallback;
	}
}