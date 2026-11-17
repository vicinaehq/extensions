import { useEffect, useState } from "react";
import {
	Action,
	ActionPanel,
	Color,
	Icon,
	List,
	getPreferenceValues,
} from "@vicinae/api";

const SEARCH_ENDPOINT = "https://search.nixos.org/backend";
const SCHEMA_VERSION_SOURCE =
	"https://raw.githubusercontent.com/NixOS/nixos-search/main/version.nix";
const CHANNEL_STATUS_SOURCE =
	"https://prometheus.nixos.org/api/v1/query?query=channel_revision";
const AUTHORIZATION = `Basic ${Buffer.from("aWVSALXpZv:X8gPHnzL52wFEekuxsfQ9cSh").toString("base64")}`;
const RESULT_LIMIT = 100;
const INDEX_CACHE_TTL_MS = 30 * 60 * 1000;
const CHANNEL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const indexCache = new Map<string, { name: string; expiresAt: number }>();
let stableChannelCache: { value: string; expiresAt: number } | undefined;
let stableChannelRequest: Promise<string | undefined> | undefined;

type Package = {
	package_attr_name: string;
	package_pname?: string;
	package_pversion?: string;
	package_description?: string;
	package_longDescription?: string;
	package_homepage?: string[];
	package_programs?: string[];
	package_platforms?: string[];
	package_license_set?: string[];
	package_maintainers_set?: string[];
	package_position?: string;
};

type Preferences = { channel?: string };
type SearchResponse = { hits?: { hits?: Array<{ _source?: unknown }> } };

const CHANNELS = new Set(["unstable", "stable"]);

function selectedChannel(): string {
	const preference = getPreferenceValues<Preferences>().channel;
	if (preference && /^\d{2}\.\d{2}$/.test(preference)) return "stable";
	return preference && CHANNELS.has(preference) ? preference : "unstable";
}

async function resolveStableChannel(): Promise<string | undefined> {
	if (stableChannelCache && stableChannelCache.expiresAt > Date.now()) {
		return stableChannelCache.value;
	}
	if (stableChannelRequest) return stableChannelRequest;

	stableChannelRequest = (async () => {
		try {
			const response = await fetch(CHANNEL_STATUS_SOURCE, {
				headers: { Accept: "application/json" },
			});
			if (!response.ok) return undefined;

			const payload: unknown = await response.json();
			if (!payload || typeof payload !== "object") return undefined;
			const data = (payload as { data?: unknown }).data;
			if (!data || typeof data !== "object") return undefined;
			const result = (data as { result?: unknown }).result;
			if (!Array.isArray(result)) return undefined;

			const releases = result
				.map((entry) => {
					if (!entry || typeof entry !== "object") return undefined;
					const metric = (entry as { metric?: unknown }).metric;
					if (!metric || typeof metric !== "object") return undefined;
					const labels = metric as Record<string, unknown>;
					const channel = labels.channel;
					if (
						labels.variant !== "primary" ||
						labels.status !== "stable" ||
						typeof channel !== "string"
					) {
						return undefined;
					}
					const match = /^nixos-(\d{2})\.(\d{2})$/.exec(channel);
					return match
						? { channel, version: Number(match[1]) * 100 + Number(match[2]) }
						: undefined;
				})
				.filter(
					(release): release is { channel: string; version: number } =>
						!!release,
				)
				.sort((left, right) => right.version - left.version);

			const latest = releases[0]?.channel;
			if (latest) {
				stableChannelCache = {
					value: latest.replace(/^nixos-/, ""),
					expiresAt: Date.now() + CHANNEL_CACHE_TTL_MS,
				};
			}
			return stableChannelCache?.value;
		} catch {
			return undefined;
		} finally {
			stableChannelRequest = undefined;
		}
	})();

	return stableChannelRequest;
}

function indexPattern(channel: string) {
	return `latest-*-nixos-${channel}`;
}

function buildQuery(query: string) {
	const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
	const positiveWords = words.filter((word) => !word.startsWith("-"));
	const negativeWords = words
		.filter((word) => word.startsWith("-") && word.length > 1)
		.map((word) => word.slice(1));
	const searchText = positiveWords.join(" ");
	const variants = (word: string) => [
		...new Set([word, word.replace(/_/g, "-"), word.replace(/-/g, "_")]),
	];
	const wildcardQueries = positiveWords.flatMap((word) =>
		variants(word).map((variant) => ({
			wildcard: {
				package_attr_name: {
					value: `*${variant}*`,
					case_insensitive: true,
				},
			},
		})),
	);
	const joinedVariants = [
		...new Set([
			positiveWords.join(""),
			positiveWords.join("-"),
			positiveWords.join("_"),
		]),
	];
	const bestMatchFields = [
		"package_attr_name^9",
		"package_attr_name.*^5.4",
		"package_programs^9",
		"package_programs.*^5.4",
		"package_mainProgram^9",
		"package_mainProgram.*^5.4",
		"package_pname^6",
		"package_pname.*^3.6",
		"package_description^1.3",
		"package_description.*^0.78",
		"package_longDescription^1",
		"package_longDescription.*^0.6",
		"flake_name^0.5",
		"flake_name.*^0.3",
	];
	return {
		from: 0,
		size: RESULT_LIMIT,
		sort: [{ _score: "desc" }],
		query: {
			bool: {
				filter: [{ term: { type: "package" } }],
				must_not: negativeWords.flatMap((word) =>
					variants(word).map((variant) => ({
						wildcard: {
							package_attr_name: {
								value: `*${variant}*`,
								case_insensitive: true,
							},
						},
					})),
				),
				must: [
					{
						dis_max: {
							tie_breaker: 0.7,
							queries: [
								{
									multi_match: {
										type: "cross_fields",
										query: searchText,
										analyzer: "whitespace",
										auto_generate_synonyms_phrase_query: false,
										operator: "and",
										fields: bestMatchFields,
									},
								},
								{
									multi_match: {
										type: "best_fields",
										query: searchText,
										fuzziness: "1",
										prefix_length: 1,
										operator: "and",
										fields: [
											"package_attr_name^0.45",
											"package_programs^0.45",
											"package_mainProgram^0.45",
											"package_pname^0.3",
										],
									},
								},
								...wildcardQueries,
							],
						},
					},
				],
				should: [
					...joinedVariants.flatMap((value) => [
						{ term: { package_attr_name: { value, boost: 100 } } },
						...["-", "_"].map((separator) => ({
							prefix: {
								package_attr_name: {
									value: `${value}${separator}`,
									boost: 100,
									case_insensitive: true,
								},
							},
						})),
						{
							prefix: {
								package_attr_name: {
									value,
									boost: 20,
									case_insensitive: true,
								},
							},
						},
					]),
					...(positiveWords.length > 1
						? [
								{
									constant_score: {
										filter: {
											multi_match: {
												type: "phrase",
												query: searchText,
												fields: [
													"package_attr_name",
													"package_pname",
													"package_programs",
													"package_mainProgram",
												],
											},
										},
										boost: 80,
									},
								},
							]
						: []),
					{
						rank_feature: {
							field: "package_repology_repos",
							boost: 5,
							saturation: { pivot: 20 },
						},
					},
					{
						rank_feature: {
							field: "package_dep_count",
							boost: 5,
							saturation: { pivot: 1000 },
						},
					},
				],
			},
		},
		rescore: {
			window_size: RESULT_LIMIT,
			query: {
				rescore_query: {
					function_score: {
						script_score: {
							script: {
								source: "1.0 / doc['package_attr_name'].value.length()",
							},
						},
					},
				},
				rescore_query_weight: 20,
			},
		},
		_source: [
			"package_attr_name",
			"package_pname",
			"package_pversion",
			"package_description",
			"package_longDescription",
			"package_homepage",
			"package_programs",
			"package_platforms",
			"package_license_set",
			"package_maintainers_set",
			"package_position",
		],
		track_total_hits: false,
	};
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return [
		...new Set(
			value
				.filter(
					(item): item is string => typeof item === "string" && !!item.trim(),
				)
				.map((item) => item.trim()),
		),
	];
}

function parsePackage(value: unknown): Package | undefined {
	if (!value || typeof value !== "object") return undefined;
	const source = value as Record<string, unknown>;
	const name = asString(source.package_attr_name);
	if (!name) return undefined;
	return {
		package_attr_name: name,
		package_pname: asString(source.package_pname),
		package_pversion: asString(source.package_pversion),
		package_description: asString(source.package_description),
		package_longDescription: asString(source.package_longDescription),
		package_homepage: asStringArray(source.package_homepage),
		package_programs: asStringArray(source.package_programs),
		package_platforms: asStringArray(source.package_platforms),
		package_license_set: asStringArray(source.package_license_set),
		package_maintainers_set: asStringArray(source.package_maintainers_set),
		package_position: asString(source.package_position),
	};
}

async function searchPackages(
	query: string,
	channel: string,
	signal: AbortSignal,
) {
	const resolvedChannel =
		channel === "stable" ? await resolveStableChannel() : channel;
	if (!resolvedChannel) {
		throw new Error(
			"Could not find the current stable NixOS channel. Try again or select Unstable.",
		);
	}
	const index = await resolveIndex(resolvedChannel, signal);
	const response = await fetch(
		`${SEARCH_ENDPOINT}/${index ?? indexPattern(resolvedChannel)}/_search`,
		{
			method: "POST",
			signal,
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: AUTHORIZATION,
				Origin: "https://search.nixos.org",
			},
			body: JSON.stringify(buildQuery(query)),
		},
	);
	if (!response.ok) {
		throw new Error(
			`Search service returned ${response.status} ${response.statusText}`,
		);
	}
	const data: SearchResponse = (await response.json()) ?? {};
	const hits = Array.isArray(data.hits?.hits) ? data.hits.hits : [];
	// A wildcard can include multiple schema generations. Prefer the first
	// (highest-ranked) hit for each attribute, and keep the React key unique.
	const uniquePackages = new Map<string, Package>();
	for (const hit of hits) {
		const pkg = parsePackage(hit?._source);
		if (pkg && !uniquePackages.has(pkg.package_attr_name)) {
			uniquePackages.set(pkg.package_attr_name, pkg);
		}
	}
	return { packages: [...uniquePackages.values()], channel: resolvedChannel };
}

async function resolveIndex(channel: string, signal: AbortSignal) {
	const cached = indexCache.get(channel);
	if (cached && cached.expiresAt > Date.now()) return cached.name;
	indexCache.delete(channel);

	// The website queries the schema version pinned in version.nix. Prefer that
	// exact version over choosing the numerically newest index, which can be a
	// newly imported index the website has not switched to yet.
	try {
		const response = await fetch(SCHEMA_VERSION_SOURCE, {
			headers: { Accept: "text/plain" },
			signal,
		});
		if (response.ok) {
			const source = await response.text();
			const schemaVersion = /^\s*frontend\s*=\s*"(\d+)"\s*;/m.exec(source)?.[1];
			if (schemaVersion) {
				const name = `latest-${schemaVersion}-nixos-${channel}`;
				indexCache.set(channel, {
					name,
					expiresAt: Date.now() + INDEX_CACHE_TTL_MS,
				});
				return name;
			}
		}
	} catch {
		// Continue to the Elasticsearch catalog fallback below.
	}

	try {
		const response = await fetch(
			`${SEARCH_ENDPOINT}/_cat/indices/${indexPattern(channel)}?format=json&h=index`,
			{
				headers: { Authorization: AUTHORIZATION, Accept: "application/json" },
				signal,
			},
		);
		if (!response.ok) return undefined;

		const indices: unknown = await response.json();
		if (!Array.isArray(indices)) return undefined;
		const versions = indices
			.map((entry) => {
				if (!entry || typeof entry !== "object") return undefined;
				const name = (entry as Record<string, unknown>).index;
				const match =
					typeof name === "string"
						? /^latest-(\d+)-nixos-[a-z0-9.-]+$/.exec(name)
						: undefined;
				return match ? { name, version: Number(match[1]) } : undefined;
			})
			.filter((entry): entry is { name: string; version: number } => !!entry)
			.sort((left, right) => right.version - left.version);
		const latest = versions[0]?.name;
		if (latest) {
			indexCache.set(channel, {
				name: latest,
				expiresAt: Date.now() + INDEX_CACHE_TTL_MS,
			});
		}
		return latest;
	} catch {
		// Some Elasticsearch proxies disable the cat API. The search endpoint
		// still works through the wildcard, and searchPackages deduplicates it.
		return undefined;
	}
}

function cleanDescription(value?: string) {
	return (
		value
			?.replace(/<[^>]*>/g, " ")
			.replace(/\s+/g, " ")
			.trim() ?? ""
	);
}

function detailMarkdown(pkg: Package) {
	const description =
		cleanDescription(pkg.package_longDescription) ||
		cleanDescription(pkg.package_description);
	return `# ${pkg.package_attr_name}\n\n${description || "_No description provided._"}`;
}

function packageUrl(name: string, channel: string) {
	return `https://search.nixos.org/packages?channel=${encodeURIComponent(channel)}&query=${encodeURIComponent(name)}`;
}

function packageRef(name: string, channel: string) {
	return `github:NixOS/nixpkgs/nixos-${channel}#${name}`;
}

function safeHomepage(homepage?: string) {
	if (!homepage) return undefined;
	try {
		const url = new URL(homepage);
		return url.protocol === "https:" || url.protocol === "http:"
			? url.toString()
			: undefined;
	} catch {
		return undefined;
	}
}

function PackageItem({ pkg, channel }: { pkg: Package; channel: string }) {
	const name = pkg.package_attr_name;
	const ref = packageRef(name, channel);
	const homepage = safeHomepage(pkg.package_homepage?.[0]);
	const programs = pkg.package_programs ?? [];
	const platforms = pkg.package_platforms ?? [];
	const maintainers = pkg.package_maintainers_set ?? [];

	return (
		<List.Item
			key={name}
			title={name}
			subtitle={cleanDescription(pkg.package_description) || undefined}
			icon={Icon.Box}
			accessories={
				pkg.package_pversion ? [{ text: `v${pkg.package_pversion}` }] : []
			}
			detail={
				<List.Item.Detail
					markdown={detailMarkdown(pkg)}
					metadata={
						<List.Item.Detail.Metadata>
							{pkg.package_pname && (
								<List.Item.Detail.Metadata.Label
									title="Name"
									text={pkg.package_pname}
								/>
							)}
							{pkg.package_pversion && (
								<List.Item.Detail.Metadata.Label
									title="Version"
									text={pkg.package_pversion}
								/>
							)}
							{pkg.package_license_set?.length ? (
								<List.Item.Detail.Metadata.Label
									title="License"
									text={pkg.package_license_set.join(", ")}
								/>
							) : null}
							{programs.length > 0 && (
								<List.Item.Detail.Metadata.TagList title="Programs">
									{programs.slice(0, 12).map((program) => (
										<List.Item.Detail.Metadata.TagList.Item
											key={program}
											text={program}
										/>
									))}
								</List.Item.Detail.Metadata.TagList>
							)}
							{platforms.length > 0 && (
								<List.Item.Detail.Metadata.TagList title="Platforms">
									{platforms.slice(0, 8).map((platform) => (
										<List.Item.Detail.Metadata.TagList.Item
											key={platform}
											text={platform}
											color={Color.SecondaryText}
										/>
									))}
								</List.Item.Detail.Metadata.TagList>
							)}
							{maintainers.length > 0 && (
								<List.Item.Detail.Metadata.Label
									title="Maintainers"
									text={maintainers.slice(0, 5).join(", ")}
								/>
							)}
							{pkg.package_position && (
								<List.Item.Detail.Metadata.Label
									title="Defined at"
									text={pkg.package_position}
								/>
							)}
						</List.Item.Detail.Metadata>
					}
				/>
			}
			actions={
				<ActionPanel>
					<ActionPanel.Section title="Nix">
						<Action.RunInTerminal
							title="Install with nix profile"
							icon={Icon.Download}
							args={["nix", "profile", "install", ref]}
							options={{ hold: true, title: `Install ${name}` }}
						/>
						<Action.RunInTerminal
							title="Run once with nix run"
							icon={Icon.Terminal}
							args={["nix", "run", ref]}
							options={{ hold: true, title: `Run ${name}` }}
						/>
						<Action.RunInTerminal
							title="Enter temporary shell"
							icon={Icon.Terminal}
							args={["nix", "shell", ref]}
							options={{ hold: true, title: `Shell: ${name}` }}
						/>
					</ActionPanel.Section>
					<ActionPanel.Section title="Copy and open">
						<Action.CopyToClipboard
							title="Copy package attribute"
							content={name}
						/>
						<Action.CopyToClipboard
							title="Copy profile install command"
							content={`nix profile install ${ref}`}
						/>
						<Action.CopyToClipboard
							title="Copy temporary shell command"
							content={`nix shell ${ref}`}
						/>
						{homepage && (
							<Action.OpenInBrowser title="Open homepage" url={homepage} />
						)}
						<Action.OpenInBrowser
							title="Open on search.nixos.org"
							url={packageUrl(name, channel)}
						/>
					</ActionPanel.Section>
				</ActionPanel>
			}
		/>
	);
}

export default function NixSearch() {
	const [channel, setChannel] = useState(selectedChannel);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<Package[]>([]);
	const [resultChannel, setResultChannel] = useState("unstable");
	const [stableRelease, setStableRelease] = useState<string>();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string>();
	const normalizedQuery = query.trim();
	const channelOptions = [
		{ title: "Unstable", value: "unstable" },
		{
			title: stableRelease ? `Stable (${stableRelease})` : "Stable",
			value: "stable",
		},
	];

	useEffect(() => {
		let mounted = true;
		void resolveStableChannel().then((release) => {
			if (mounted) setStableRelease(release);
		});
		return () => {
			mounted = false;
		};
	}, []);

	useEffect(() => {
		if (!normalizedQuery) {
			setResults([]);
			setResultChannel(
				channel === "stable" ? (stableRelease ?? "stable") : channel,
			);
			setError(undefined);
			setIsLoading(false);
			return;
		}

		setResults([]);
		setError(undefined);
		setIsLoading(true);
		const controller = new AbortController();
		void searchPackages(normalizedQuery, channel, controller.signal)
			.then(({ packages, channel: resolvedChannel }) => {
				if (!controller.signal.aborted) {
					setResults(packages);
					setResultChannel(resolvedChannel);
				}
			})
			.catch((cause: unknown) => {
				if (!controller.signal.aborted) {
					setResults([]);
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			})
			.finally(() => {
				if (!controller.signal.aborted) setIsLoading(false);
			});

		return () => {
			controller.abort();
		};
	}, [normalizedQuery, channel]);

	return (
		<List
			searchText={query}
			filtering={false}
			isLoading={isLoading}
			searchBarPlaceholder={`Search nixpkgs (${
				channel === "stable" ? (stableRelease ?? "stable") : channel
			})...`}
			searchBarAccessory={
				<List.Dropdown
					tooltip="Nixpkgs channel"
					value={channel}
					onChange={setChannel}
				>
					{channelOptions.map((option) => (
						<List.Dropdown.Item
							key={option.value}
							title={option.title}
							value={option.value}
						/>
					))}
				</List.Dropdown>
			}
			onSearchTextChange={setQuery}
			throttle
			isShowingDetail
		>
			{error ? (
				<List.EmptyView
					title="Could not search nixpkgs"
					description={error}
					icon={Icon.Exclamationmark}
				/>
			) : normalizedQuery && !isLoading && results.length === 0 ? (
				<List.EmptyView
					title="No packages found"
					description={`No nixpkgs results for “${normalizedQuery}”.`}
					icon={Icon.MagnifyingGlass}
				/>
			) : (
				results.map((pkg) => (
					<PackageItem
						key={pkg.package_attr_name}
						pkg={pkg}
						channel={resultChannel}
					/>
				))
			)}
		</List>
	);
}
