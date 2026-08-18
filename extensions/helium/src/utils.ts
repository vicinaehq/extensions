import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { getPreferenceValues, Icon, type ImageLike } from "@vicinae/api";
import initSqlJs, { Database } from "sql.js";

type HeliumPreferences = {
	profile_dir: string;
};

const preferences = getPreferenceValues<HeliumPreferences>();

export const HELIUM_DATA_DIR = path.join(homedir(), preferences.profile_dir);

export type Profile = { name: string; path: string };

export function getHeliumProfiles(): { profiles: Profile[]; defaultProfile: string } {
	const profiles: Profile[] = [];

	if (!existsSync(HELIUM_DATA_DIR)) {
		return { profiles, defaultProfile: "" };
	}

	const entries = readdirSync(HELIUM_DATA_DIR, { withFileTypes: true });

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const profilePath = path.join(HELIUM_DATA_DIR, entry.name);
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

export async function openHistoryDb(profilePath: string): Promise<Database> {
	return openSqliteDb(path.join(HELIUM_DATA_DIR, profilePath, "History"));
}

export function extractHost(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return "";
	}
}

/**
 * Favicon for a URL, falling back to a built-in icon when the fetch fails
 * (e.g. chrome:// pages or unreachable hosts).
 */
export function getFavicon(url: string, fallback: Icon): ImageLike {
	try {
		const host = new URL(url).hostname;
		if (!host) return fallback;
		return { source: `https://www.google.com/s2/favicons?domain=${host}&sz=32`, fallback };
	} catch {
		return fallback;
	}
}
