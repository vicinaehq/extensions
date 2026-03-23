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

const SteamGenreSchema = z.looseObject({
	id: z.optional(z.nullable(z.string())),
	description: z.optional(z.nullable(z.string())),
});

const SteamPriceOverviewSchema = z.looseObject({
	currency: z.string(),
	initial: z.number(),
	final: z.number(),
	discount_percent: z.number(),
	initial_formatted: z.string(),
	final_formatted: z.string(),
});

const SteamReleaseDateSchema = z.looseObject({
	coming_soon: z.boolean(),
	date: z.string(),
});

const SteamMetacriticSchema = z.looseObject({
	score: z.number(),
	url: z.string(),
});

const SteamRequirementsSchema = z.union([
	z.looseObject({
		minimum: z.optional(z.string()),
		recommended: z.optional(z.string()),
	}),
	z.string(),
	z.array(z.unknown()),
]);

export const SteamAppDetailsSchema = z.looseObject({
	name: z.string(),
	type: z.optional(z.nullable(z.string())),
	steam_appid: z.optional(z.nullable(z.number())),
	is_free: z.optional(z.nullable(z.boolean())),
	short_description: z.optional(z.nullable(z.string())),
	header_image: z.optional(z.nullable(z.string())),
	capsule_imagev5: z.optional(z.nullable(z.string())),
	website: z.optional(z.nullable(z.string())),
	developers: z.optional(z.nullable(z.array(z.string()))),
	publishers: z.optional(z.nullable(z.array(z.string()))),
	price_overview: z.optional(z.nullable(SteamPriceOverviewSchema)),
	release_date: z.optional(z.nullable(SteamReleaseDateSchema)),
	metacritic: z.optional(z.nullable(SteamMetacriticSchema)),
	genres: z.optional(z.nullable(z.array(SteamGenreSchema))),
	pc_requirements: z.optional(z.nullable(SteamRequirementsSchema)),
	linux_requirements: z.optional(z.nullable(SteamRequirementsSchema)),
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
		data?: unknown;
	};
};
