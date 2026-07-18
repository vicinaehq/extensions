export type LoginType = "local" | "jellyfin";

export type ViewMode = "grid" | "list";

export interface Preferences {
	"server-url": string;
	"login-type": LoginType;
	username?: string;
	password?: string;
	"view-mode"?: ViewMode;
}

export interface MediaInfo {
	id: number;
	tmdbId: number;
	tvdbId?: number;
	status: number;
}

export interface MediaResult {
	id: number;
	mediaType: "movie" | "tv";
	title?: string;
	name?: string;
	posterPath?: string;
	backdropPath?: string;
	overview?: string;
	releaseDate?: string;
	firstAirDate?: string;
	voteAverage?: number;
	voteCount?: number;
	mediaInfo?: MediaInfo;
}

export interface TrendingResponse {
	page: number;
	totalPages: number;
	totalResults: number;
	results: MediaResult[];
}

export interface Genre {
	id: number;
	name: string;
}

export interface Season {
	id: number;
	seasonNumber: number;
	name: string;
	overview?: string;
	episodeCount?: number;
}

export interface MediaDetails {
	id: number;
	title?: string;
	name?: string;
	overview: string;
	posterPath?: string | null;
	backdropPath?: string | null;
	releaseDate?: string;
	firstAirDate?: string;
	voteAverage: number;
	voteCount: number;
	genres: Genre[];
	seasons?: Season[];
	status?: string;
}
