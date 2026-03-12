import { Cache } from "@vicinae/api";
import { useState } from "react";
import { RECENT_ICONS_LIMIT } from "../constants";
import {
	parseRecentIconsJson,
	type RecentIcon,
} from "../schemas/recent-icons-schema";

const RECENT_ICONS_CACHE_KEY = "nerdfont-search.recent-icons.v1";
const cache = new Cache();

function readRecentIcons(): RecentIcon[] {
	const cached = cache.get(RECENT_ICONS_CACHE_KEY);
	const recentIcons = parseRecentIconsJson(cached);

	if (cached && recentIcons.length === 0) {
		cache.remove(RECENT_ICONS_CACHE_KEY);
	}

	return recentIcons;
}

function writeRecentIcons(icons: RecentIcon[]) {
	cache.set(RECENT_ICONS_CACHE_KEY, JSON.stringify(icons));
}

export function useRecentIcons() {
	const [recentIcons, setRecentIcons] = useState<RecentIcon[]>(readRecentIcons);

	const addRecent = (icon: RecentIcon) => {
		setRecentIcons((current: RecentIcon[]) => {
			const deduped = current.filter((item: RecentIcon) => item.id !== icon.id);
			const updated: RecentIcon[] = [icon, ...deduped].slice(
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
