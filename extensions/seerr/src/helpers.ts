import type { MediaResult } from "./types";

export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
export const GRID_COLUMNS = 5;
export const ASPECT_RATIO = "2/3";

export function posterUrl(path?: string | null): string | null {
	return path ? `${TMDB_IMAGE_BASE}${path}` : null;
}

export function getTitle(item: { title?: string; name?: string }): string {
	return item.title || item.name || "Unknown";
}

export function getYear(item: {
	releaseDate?: string;
	firstAirDate?: string;
}): string {
	const dateStr = item.releaseDate || item.firstAirDate;
	if (!dateStr) return "";
	const date = new Date(dateStr);
	return Number.isNaN(date.getTime()) ? "" : date.getFullYear().toString();
}

export function formatRating(voteAverage?: number): string {
	return voteAverage ? `${(voteAverage / 2).toFixed(1)}/5` : "";
}

export function mediaTypeLabel(type: "movie" | "tv"): string {
	return type === "movie" ? "Movie" : "TV Show";
}

export function mediaTypeKey(type: "movie" | "tv"): string {
	return type === "movie" ? "movie" : "tv";
}

export function posterSource(poster: string, title: string) {
	return { value: { source: poster }, tooltip: title };
}

export function duplicateKey(item: MediaResult): string {
	return `${item.mediaType}-${item.id}`;
}

export function mergeUnique(
	prev: MediaResult[],
	next: MediaResult[],
): MediaResult[] {
	const map = new Map<string, MediaResult>();
	for (const item of prev) {
		map.set(duplicateKey(item), item);
	}
	for (const item of next) {
		map.set(duplicateKey(item), item);
	}
	return Array.from(map.values());
}
