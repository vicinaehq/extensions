// Types for ProtonDB and Steam API
import * as z from "zod/v4/mini";

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

const SteamGenreSchema = z.object({
	id: z.string(),
	description: z.string(),
});

const SteamPriceOverviewSchema = z.object({
	currency: z.string(),
	initial: z.number(),
	final: z.number(),
	discount_percent: z.number(),
	initial_formatted: z.string(),
	final_formatted: z.string(),
});

const SteamReleaseDateSchema = z.object({
	coming_soon: z.boolean(),
	date: z.string(),
});

const SteamMetacriticSchema = z.object({
	score: z.number(),
	url: z.string(),
});

const SteamRequirementsSchema = z.union([
	z.object({
		minimum: z.optional(z.string()),
		recommended: z.optional(z.string()),
	}),
	z.string(),
]);

export const SteamAppDetailsSchema = z.object({
	type: z.string(),
	name: z.string(),
	steam_appid: z.number(),
	required_age: z.number(),
	is_free: z.boolean(),
	detailed_description: z.string(),
	about_the_game: z.string(),
	short_description: z.string(),
	supported_languages: z.string(),
	header_image: z.string(),
	capsule_image: z.string(),
	capsule_imagev5: z.string(),
	website: z.optional(z.string()),
	developers: z.optional(z.array(z.string())),
	publishers: z.optional(z.array(z.string())),
	price_overview: z.optional(SteamPriceOverviewSchema),
	release_date: SteamReleaseDateSchema,
	platforms: z.object({
		windows: z.boolean(),
		mac: z.boolean(),
		linux: z.boolean(),
	}),
	metacritic: z.optional(SteamMetacriticSchema),
	genres: z.optional(z.array(SteamGenreSchema)),
	pc_requirements: SteamRequirementsSchema,
	mac_requirements: SteamRequirementsSchema,
	linux_requirements: SteamRequirementsSchema,
});

export type SteamGenre = z.infer<typeof SteamGenreSchema>;
export type SteamPriceOverview = z.infer<typeof SteamPriceOverviewSchema>;
export type SteamReleaseDate = z.infer<typeof SteamReleaseDateSchema>;
export type SteamMetacritic = z.infer<typeof SteamMetacriticSchema>;
export type SteamRequirements = z.infer<typeof SteamRequirementsSchema>;
export type SteamAppDetails = z.infer<typeof SteamAppDetailsSchema>;

export type SteamAppDetailsResponse = {
	[appId: string]: {
		success: boolean;
		data?: SteamAppDetails;
	};
};
