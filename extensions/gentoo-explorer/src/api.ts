const BASE_URL = "https://ebuilds.info/api/v1";

export const SITE_URL = "https://ebuilds.info";

export type PackageSummary = {
	id: number;
	category: string;
	name: string;
	overlay: string;
	description: string | null;
	homepage: string | null;
	keywords: string | null;
	version: string | null;
};

export type LatestPackage = PackageSummary & {
	gitCreatedAt: string;
};

export type SearchResponse = {
	totalCount: number;
	results: PackageSummary[];
};

export type Ebuild = {
	id: number;
	version: string;
	slot: string;
	keywords: string | null;
	license: string | null;
	eapi: number;
	useFlags: string | null;
	depend: string | null;
	rdepend: string | null;
	bdepend: string | null;
	srcUri: string | null;
	firstSeen: string;
	gitCreatedAt: string | null;
	historic: boolean;
};

export type PackageDetail = {
	id: number;
	category: string;
	name: string;
	overlay: string;
	description: string | null;
	homepage: string | null;
	longDescription: string | null;
	maintainerName: string | null;
	maintainerEmail: string | null;
	ebuilds: Ebuild[];
};

export type DepEdge = {
	from: string;
	to: string;
	type: "depend" | "rdepend" | "bdepend";
	condition: string | null;
};

export type DepGraph = {
	root: { category: string; name: string; version: string };
	edges: DepEdge[];
};

export type Category = {
	name: string;
	count: number;
	description: string | null;
};

export type Overlay = {
	id: number;
	name: string;
	description: string | null;
	homepage: string | null;
	quality: string | null;
	status: string | null;
	packageCount: number;
	ebuildCount: number;
	lastCommit: string | null;
};

export type UseFlag = {
	name: string;
	count: number;
	description: string | null;
};

export type NewsItem = {
	id: number;
	title: string;
	slug: string;
	url: string;
	summary: string;
	publishedAt: string;
};

export type Glsa = {
	id: number;
	glsaId: string;
	title: string;
	url: string;
	summary: string;
	severity: string;
	access: string;
	description: string;
	impact: string;
	resolution: string;
	cves: string[];
	bugs: number[];
	affectedPackages: string[];
	publishedAt: string;
};

export type PortageNewsItem = {
	id: number;
	itemId: string;
	title: string;
	author: string;
	posted: string;
	packages: string[];
	body?: string;
};

const get = async <T>(
	path: string,
	params?: Record<string, string | number | undefined>,
	signal?: AbortSignal,
): Promise<T> => {
	const url = new URL(`${BASE_URL}${path}`);

	for (const [key, value] of Object.entries(params ?? {})) {
		if (value !== undefined && value !== "") {
			url.searchParams.set(key, String(value));
		}
	}

	const res = await fetch(url, { signal });

	if (res.status === 429) {
		throw new Error("Rate limit reached (60 requests/min). Please wait a bit.");
	}

	if (!res.ok) {
		throw new Error(`ebuilds.info returned ${res.status}: ${await res.text()}`);
	}

	return res.json() as Promise<T>;
};

export type SearchFilters = {
	q?: string;
	category?: string;
	overlay?: string;
	arch?: string;
	maintainer?: string;
	limit?: number;
	offset?: number;
};

export const searchPackages = (filters: SearchFilters, signal?: AbortSignal) =>
	get<SearchResponse>("/search", { limit: 100, ...filters }, signal);

export const getLatestPackages = (signal?: AbortSignal) =>
	get<LatestPackage[]>("/packages/latest", undefined, signal);

export const getPackage = (
	category: string,
	name: string,
	overlay?: string,
	signal?: AbortSignal,
) => get<PackageDetail>(`/packages/${category}/${name}`, { overlay }, signal);

export const getDeps = (
	category: string,
	name: string,
	depth: number,
	signal?: AbortSignal,
) => get<DepGraph>(`/packages/${category}/${name}/deps`, { depth }, signal);

export const getCategories = (signal?: AbortSignal) =>
	get<Category[]>("/packages/categories", undefined, signal);

export const getOverlays = (signal?: AbortSignal) =>
	get<Overlay[]>("/overlays", undefined, signal);

export const getUseFlags = (signal?: AbortSignal) =>
	get<UseFlag[]>("/packages/useflags", undefined, signal);

export const getUseFlagPackages = (flag: string, signal?: AbortSignal) =>
	get<PackageSummary[]>(`/packages/useflag/${flag}`, { limit: 1000 }, signal);

export const getNews = (signal?: AbortSignal) =>
	get<NewsItem[]>("/news", undefined, signal);

export const getGlsa = (signal?: AbortSignal) =>
	get<Glsa[]>("/glsa", undefined, signal);

export const getPackagePortageNews = (
	category: string,
	name: string,
	signal?: AbortSignal,
) =>
	get<PortageNewsItem[]>(
		`/portage-news/package/${category}/${name}`,
		undefined,
		signal,
	);

export const packageUrl = (category: string, name: string) =>
	`${SITE_URL}/package/${category}/${name}`;

export const overlayUrl = (name: string) => `${SITE_URL}/overlay/${name}`;
