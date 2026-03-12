import { Cache } from "@vicinae/api";
import { useState } from "react";
import { z } from "zod/v4-mini";
import { RECENT_ICONS_LIMIT } from "../constants";

const RECENT_ICONS_CACHE_KEY = "nerdfont-search.recent-icons.v1";
const cache = new Cache();

const recentIconSchema = z.object({
	id: z.string(),
	char: z.string(),
	code: z.string(),
	hexCode: z.string(),
	htmlEntity: z.string(),
	displayName: z.string(),
	nerdFontId: z.string(),
	packLabel: z.string(),
	iconPath: z.string(),
});

const recentIconsSchema = z.array(recentIconSchema);

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

function readRecentIcons(): RecentIcon[] {
	const cached = cache.get(RECENT_ICONS_CACHE_KEY);

	if (!cached) {
		return [];
	}

	try {
		const parsed: unknown = JSON.parse(cached);
		const validated = recentIconsSchema.safeParse(parsed);
		if (validated.success) {
			return validated.data;
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
