import { Cache } from "@vicinae/api";
import { useState } from "react";
import { RECENT_ICONS_LIMIT } from "../constants";

const RECENT_ICONS_CACHE_KEY = "nerdfont-search.recent-icons.v1";
const cache = new Cache();

interface RecentIcon {
	id: string;
	char: string;
	code: string;
	hexCode: string;
	htmlEntity: string;
	displayName: string;
	nerdFontId: string;
	packLabel: string;
	iconPath: string;
}

const RECENT_ICON_SCHEMA = {
	id: "string",
	char: "string",
	code: "string",
	hexCode: "string",
	htmlEntity: "string",
	displayName: "string",
	nerdFontId: "string",
	packLabel: "string",
	iconPath: "string",
} as const satisfies Record<keyof RecentIcon, "string">;

const RECENT_ICON_KEYS = Object.keys(RECENT_ICON_SCHEMA) as Array<keyof RecentIcon>;

function isRecentIcon(value: unknown): value is RecentIcon {
	if (isRecord(value) === false) {
		return false;
	}

	return RECENT_ICON_KEYS.every((key) => typeof value[key] === RECENT_ICON_SCHEMA[key]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function readRecentIcons(): RecentIcon[] {
	const cached = cache.get(RECENT_ICONS_CACHE_KEY);

	if (!cached) {
		return [];
	}

	try {
		const parsed: unknown = JSON.parse(cached);
		if (Array.isArray(parsed) && parsed.every(isRecentIcon)) {
			return parsed;
		}
		cache.remove(RECENT_ICONS_CACHE_KEY);
		return [];
	} catch {
		cache.remove(RECENT_ICONS_CACHE_KEY);
		return [];
	}
}

function writeRecentIcons(icons: RecentIcon[]) {
	cache.set(RECENT_ICONS_CACHE_KEY, JSON.stringify(icons));
}

export function useRecentIcons() {
	const [recentIcons, setRecentIcons] = useState<RecentIcon[]>(readRecentIcons);

	const addRecent = (icon: RecentIcon) => {
		setRecentIcons((current) => {
			const updated = [icon, ...current.filter((item) => item.id !== icon.id)].slice(
				0,
				RECENT_ICONS_LIMIT,
			);

			writeRecentIcons(updated);
			return updated;
		});
	};

	const clearRecent = () => {
		cache.remove(RECENT_ICONS_CACHE_KEY);
		setRecentIcons([]);
	};

	return {
		recentIcons,
		addRecent,
		clearRecent,
	};
}

export type { RecentIcon };
