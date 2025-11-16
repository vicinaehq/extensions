import { Cache, Icon, WindowManagement } from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";

const METADATA =
	"https://raw.githubusercontent.com/homarr-labs/dashboard-icons/refs/heads/main/metadata.json";
export const CDN_BASE_URL =
	"https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons";
export const REQUEST_ICON_URL =
	'"https://github.com/homarr-labs/dashboard-icons/issues/new/choose';

const cache = new Cache();
const METADATA_CACHE_KEY = "metadata";

export type DashboardIcon = {
	name: string;
	base: string;
	aliases: string[];
	categories: string[];
	update: {
		timestamp: string;
		author: {
			id: number;
			name: string;
		};
	};
	colors?: {
		dark?: string;
		light?: string;
	};
};

export type IconGroup = {
	name: string;
	icons: DashboardIcon[];
};

const groupIcons = (icons: DashboardIcon[]): IconGroup[] => {
	const groups = new Map<string, DashboardIcon[]>();

	for (const icon of icons) {
		const categories =
			icon.categories.length > 0 ? icon.categories : ["Uncategorized"];

		for (const category of categories) {
			let grp = groups.get(category);
			if (!grp) {
				grp = [] as DashboardIcon[];
				groups.set(category, grp);
			}
			grp.push(icon);
		}
	}

	const categories = Array.from(groups.keys()).sort((a, b) =>
		a.toLowerCase().localeCompare(b.toLowerCase()),
	);

	return categories.map((c) => ({ name: c, icons: groups.get(c)! }));
};

const usePromise = <T, E = unknown>(fn: (...args: unknown[]) => Promise<T>) => {
	const [data, setData] = useState<T | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<E | null>(null);

	const refresh = () => {
		setLoading(true);
		fn()
			.then(setData)
			.catch((err) => setError(err))
			.finally(() => setLoading(false));
	};

	useEffect(() => {
		refresh();
	}, []);

	return { data, loading, error, refresh };
};

const fetchMetadata = async (): Promise<DashboardIcon[]> => {
	const cached = cache.get(METADATA_CACHE_KEY);
	if (cached) {
		return JSON.parse(cached);
	}

	const res = await fetch(METADATA);
	if (!res.ok) throw new Error(`Failed to fetch dashboard icons`);
	const json = (await res.json()) as { [name: string]: any };
	const icons = Object.entries(json)
		.map<DashboardIcon>(([name, data]) => ({
			name,
			...data,
		}))
		.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

	cache.set(METADATA_CACHE_KEY, JSON.stringify(icons));
	return icons;
};

export const useGroupedIcons = (icons: DashboardIcon[] | null) => {
	return useMemo(() => groupIcons(icons ?? []), [icons]);
};

export const useDashboardIcons = () => {
	const { data: icons, loading, error, refresh } = usePromise(fetchMetadata);
	const groupedIcons = useGroupedIcons(icons);
	const clearCache = () => {
		cache.remove(METADATA_CACHE_KEY);
		refresh();
	};

	return { icons, groupedIcons, loading, error, clearCache };
};
