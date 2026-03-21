// Types for ProtonDB and Steam API

export type SteamGame = {
	appid: string;
	name: string;
	icon: string;
	logo: string;
};

export type ProtonDBTier =
	| "borked"
	| "bronze"
	| "silver"
	| "gold"
	| "platinum"
	| "native"
	| "pending";

export type ProtonDBConfidence = "strong" | "moderate" | "weak" | "pending";

export type ProtonDBRating = {
	bestReportedTier: ProtonDBTier;
	confidence: ProtonDBConfidence;
	score: number;
	tier: ProtonDBTier;
	total: number;
	trendingTier: ProtonDBTier;
};

export type GameWithRating = {
	game: SteamGame;
	rating: ProtonDBRating | null;
	isLoadingRating: boolean;
};

// Steam API Response Types
export type SteamFeaturedItem = {
	id: number;
	type: number;
	name: string;
	discounted: boolean;
	discount_percent: number;
	original_price?: number;
	final_price: number;
	currency: string;
	large_capsule_image: string;
	small_capsule_image: string;
	windows_available: boolean;
	mac_available: boolean;
	linux_available: boolean;
	streamingvideo_available: boolean;
	header_image: string;
	controller_support?: string;
};

export type SteamFeaturedCategories = {
	top_sellers?: {
		id: string;
		name: string;
		items: SteamFeaturedItem[];
	};
	specials?: {
		id: string;
		name: string;
		items: SteamFeaturedItem[];
	};
	[key: string]: unknown;
};

export type SteamGenre = {
	id: string;
	description: string;
};

export type SteamPriceOverview = {
	currency: string;
	initial: number;
	final: number;
	discount_percent: number;
	initial_formatted: string;
	final_formatted: string;
};

export type SteamReleaseDate = {
	coming_soon: boolean;
	date: string;
};

export type SteamMetacritic = {
	score: number;
	url: string;
};

export type SteamRequirements =
	| {
			minimum?: string;
			recommended?: string;
	  }
	| string;

export type SteamAppDetails = {
	type: string;
	name: string;
	steam_appid: number;
	required_age: number;
	is_free: boolean;
	detailed_description: string;
	about_the_game: string;
	short_description: string;
	supported_languages: string;
	header_image: string;
	capsule_image: string;
	capsule_imagev5: string;
	website?: string;
	developers?: string[];
	publishers?: string[];
	price_overview?: SteamPriceOverview;
	release_date: SteamReleaseDate;
	platforms: {
		windows: boolean;
		mac: boolean;
		linux: boolean;
	};
	metacritic?: SteamMetacritic;
	genres?: SteamGenre[];
	pc_requirements: SteamRequirements;
	mac_requirements: SteamRequirements;
	linux_requirements: SteamRequirements;
};

export type SteamAppDetailsResponse = {
	[appId: string]: {
		success: boolean;
		data?: SteamAppDetails;
	};
};
