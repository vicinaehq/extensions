type SearchWallpapersOptions = {
	query: string;
	atLeast?: string;
	resolutions?: string[];
	ratios?: string[];
	page?: number;
	sorting?:
		| "date_added"
		| "relevance"
		| "random"
		| "views"
		| "favorites"
		| "toplist";
};

const BASE_URL = "https://wallhaven.cc/api/v1/search";

export type WallpaperResult = {
	id: string;
	url: string;
	path: string;
	resolution: string;
	file_size: number;
	category: string;
	thumbs: {
		large: string;
		original: string;
		small: string;
	};
};

export type WallpaperSearchResponse = {
	data: WallpaperResult[];
	meta: {
		current_page: number;
		last_page: number;
	};
};

export const searchWallpapers = async (
	options: SearchWallpapersOptions,
): Promise<WallpaperSearchResponse> => {
	const params = new URLSearchParams();

	params.set("q", options.query);

	if (options.atLeast) params.set("atleast", options.atLeast);
	if (options.resolutions)
		params.set("resolutions", options.resolutions.join(","));
	if (options.ratios) params.set("ratios", options.ratios.join(","));
	if (options.page) params.set("page", `${options.page}`);
	if (options.sorting) params.set("sorting", options.sorting);

	const res = await fetch(`${BASE_URL}?${params}`);

	if (!res.ok) throw new Error(`Wallhaven search failed (${res.status})`);

	return (await res.json()) as WallpaperSearchResponse;
};
