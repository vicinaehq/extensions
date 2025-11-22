import { getPreferenceValues } from "@vicinae/api";
import {
  NixPackageResponse,
  PackageItem,
  NixOptionResponse,
  OptionItem,
  NixPackage,
  NixOption,
  NixFlakeResponse,
  FlakeItem,
  NixFlake,
  HomeManagerOptionItem,
  HomeManagerOptionResponse,
  PullRequest,
  FullPullRequest,
} from "./types";

interface Preferences {
  searchUrl: string;
  authToken: string;
  homeManagerOptionsUrl: string;
  githubToken: string;
}

const preferences = getPreferenceValues<Preferences>();

// Common constants
const COMMON_HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:138.0) Gecko/20100101 Firefox/138.0",
  Origin: "https://search.nixos.org/",
  Accept: "application/json",
  "Content-Type": "application/json",
  Authorization: `Basic ${preferences.authToken}`,
};

function createPackageQueryPayload(query: string, sourceFields: string[]) {
  return {
    from: 0,
    size: 50,
    sort: [{ _score: "desc", package_attr_name: "desc", package_pversion: "desc" }],
    aggs: {
      package_attr_set: { terms: { field: "package_attr_set", size: 20 } },
      package_license_set: { terms: { field: "package_license_set", size: 20 } },
      package_maintainers_set: { terms: { field: "package_maintainers_set", size: 20 } },
      package_teams_set: { terms: { field: "package_teams_set", size: 20 } },
      package_platforms: { terms: { field: "package_platforms", size: 20 } },
      all: {
        global: {},
        aggregations: {
          package_attr_set: { terms: { field: "package_attr_set", size: 20 } },
          package_license_set: { terms: { field: "package_license_set", size: 20 } },
          package_maintainers_set: { terms: { field: "package_maintainers_set", size: 20 } },
          package_teams_set: { terms: { field: "package_teams_set", size: 20 } },
          package_platforms: { terms: { field: "package_platforms", size: 20 } },
        },
      },
    },
    query: {
      bool: {
        filter: [
          { term: { type: { value: "package", _name: "filter_packages" } } },
          {
            bool: {
              must: [
                { bool: { should: [] } },
                { bool: { should: [] } },
                { bool: { should: [] } },
                { bool: { should: [] } },
                { bool: { should: [] } },
              ],
            },
          },
        ],
        must_not: [],
        must: [
          {
            dis_max: {
              tie_breaker: 0.7,
              queries: [
                {
                  multi_match: {
                    type: "cross_fields",
                    query: query,
                    analyzer: "whitespace",
                    auto_generate_synonyms_phrase_query: false,
                    operator: "and",
                    _name: `multi_match_${query}`,
                    fields: [
                      "package_attr_name^9",
                      "package_attr_name.*^5.3999999999999995",
                      "package_programs^9",
                      "package_programs.*^5.3999999999999995",
                      "package_pname^6",
                      "package_pname.*^3.5999999999999996",
                      "package_description^1.3",
                      "package_description.*^0.78",
                      "package_longDescription^1",
                      "package_longDescription.*^0.6",
                      "flake_name^0.5",
                      "flake_name.*^0.3",
                    ],
                  },
                },
                {
                  wildcard: {
                    package_attr_name: {
                      value: `*${query}*`,
                      case_insensitive: true,
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
    _source: sourceFields,
    track_total_hits: true,
  };
}

export function cleanText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "")
    .trim();
}

export async function searchNixPackages(query: string): Promise<PackageItem[]> {
  const queryPayload = createPackageQueryPayload(query, [
    "type",
    "package_attr_name",
    "package_attr_set",
    "package_pname",
    "package_pversion",
    "package_platforms",
    "package_outputs",
    "package_default_output",
    "package_programs",
    "package_mainProgram",
    "package_license",
    "package_license_set",
    "package_maintainers",
    "package_maintainers_set",
    "package_teams",
    "package_teams_set",
    "package_description",
    "package_longDescription",
    "package_hydra",
    "package_system",
    "package_homepage",
    "package_position",
  ]);

  try {
    const response = await fetch(preferences.searchUrl, {
      method: "POST",
      headers: COMMON_HEADERS,
      body: JSON.stringify(queryPayload),
    });

    if (!response.ok) {
      throw new Error(`Search request failed: ${response.status}`);
    }

    const data: NixPackageResponse = await response.json();

    const packageMap = new Map<string, PackageItem>();

    data.hits.hits.forEach((hit) => {
      const source = hit._source as NixPackage;
      const package_position = source.package_position;
      const parts = package_position.split(":");
      const line = parts[parts.length - 1];
      const file_path = parts.slice(0, -1).join(":");
      const cleanFilePath = file_path.startsWith("/") ? file_path.slice(1) : file_path;
      const sourceUrl = `https://github.com/NixOS/nixpkgs/blob/master/${cleanFilePath}#L${line}`;

      const description = source.package_description || "No description available.";
      const trimmedDescription = cleanText(description);

      const pkg: PackageItem = {
        name: source.package_attr_name,
        version: source.package_pversion,
        description: trimmedDescription,
        homepage: source.package_homepage[0] || "",
        licenses: source.package_license_set.join(", "),
        sourceUrl,
        score: hit._score,
        pname: source.package_pname,
        platforms: source.package_platforms,
        maintainers: source.package_maintainers_set.join(", "),
        longDescription: source.package_longDescription ? cleanText(source.package_longDescription) : null,
      };

      const key = `${pkg.name}-${pkg.version}`;
      if (!packageMap.has(key)) {
        packageMap.set(key, pkg);
      }
    });

    return Array.from(packageMap.values()).sort((a, b) => b.score - a.score);
  } catch (error) {
    console.error("Failed to search Nix packages:", error);
    throw error;
  }
}

export async function searchNixOptions(query: string): Promise<OptionItem[]> {
  const queryPayload = {
    from: 0,
    size: 50,
    sort: [{ _score: "desc", option_name: "desc" }],
    aggs: {
      all: {
        global: {},
        aggregations: {},
      },
    },
    query: {
      bool: {
        filter: [{ term: { type: { value: "option", _name: "filter_options" } } }],
        must_not: [],
        must: [
          {
            dis_max: {
              tie_breaker: 0.7,
              queries: [
                {
                  multi_match: {
                    type: "cross_fields",
                    query: query,
                    analyzer: "whitespace",
                    auto_generate_synonyms_phrase_query: false,
                    operator: "and",
                    _name: `multi_match_${query}`,
                    fields: [
                      "option_name^6",
                      "option_name.*^3.5999999999999996",
                      "option_description^1",
                      "option_description.*^0.6",
                      "flake_name^0.5",
                      "flake_name.*^0.3",
                    ],
                  },
                },
                {
                  wildcard: {
                    option_name: {
                      value: `*${query}*`,
                      case_insensitive: true,
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
    _source: [
      "option_name",
      "option_description",
      "flake_name",
      "option_type",
      "option_default",
      "option_example",
      "option_source",
    ],
  };

  try {
    const response = await fetch(preferences.searchUrl, {
      method: "POST",
      headers: COMMON_HEADERS,
      body: JSON.stringify(queryPayload),
    });

    if (!response.ok) {
      throw new Error(`Search request failed: ${response.status}`);
    }

    const data: NixOptionResponse = await response.json();

    const optionMap = new Map<string, OptionItem>();

    data.hits.hits.forEach((hit) => {
      const source = hit._source as NixOption;
      const description = source.option_description || "No description available.";
      const trimmedDescription = cleanText(description);

      const sourceUrl = source.option_source
        ? `https://github.com/NixOS/nixpkgs/blob/master/${source.option_source}`
        : undefined;

      const option: OptionItem = {
        name: source.option_name,
        description: trimmedDescription,
        flake: source.option_flake,
        type: source.option_type,
        default: source.option_default,
        example: source.option_example ? cleanText(source.option_example) : undefined,
        option_source: source.option_source,
        sourceUrl,
        score: hit._score,
      };

      const key = option.name;
      if (!optionMap.has(key)) {
        optionMap.set(key, option);
      }
    });

    return Array.from(optionMap.values()).sort((a, b) => b.score - a.score);
  } catch (error) {
    console.error("Failed to search Nix options:", error);
    throw error;
  }
}

export async function searchNixFlakes(query: string): Promise<FlakeItem[]> {
  // Flakes use a different index than packages
  const searchUrl = preferences.searchUrl.replace("latest-44-nixos-unstable", "latest-44-group-manual");

  const queryPayload = createPackageQueryPayload(query, [
    "type",
    "flake_description",
    "flake_resolved",
    "flake_name",
    "revision",
    "flake_source",
    "package_attr_name",
    "package_attr_set",
    "package_pname",
    "package_pversion",
    "package_platforms",
    "package_outputs",
    "package_default_output",
    "package_programs",
    "package_mainProgram",
    "package_license",
    "package_license_set",
    "package_maintainers",
    "package_maintainers_set",
    "package_teams",
    "package_teams_set",
    "package_description",
    "package_longDescription",
    "package_hydra",
    "package_system",
    "package_homepage",
    "package_position",
  ]);

  try {
    const response = await fetch(searchUrl, {
      method: "POST",
      headers: COMMON_HEADERS,
      body: JSON.stringify(queryPayload),
    });

    if (!response.ok) {
      throw new Error(`Search request failed: ${response.status}`);
    }

    const data: NixFlakeResponse = await response.json();

    const flakeMap = new Map<string, FlakeItem>();

    data.hits.hits.forEach((hit) => {
      const source = hit._source as NixFlake;

      // For flakes, we need flake_resolved data, but if it doesn't exist,
      // we can still show the package as a potential flake
      let flake: FlakeItem | null = null;

      if (source.flake_resolved) {
        const sourceUrl = `https://github.com/${source.flake_resolved.owner}/${source.flake_resolved.repo}`;

        flake = {
          name: source.package_attr_name,
          description: source.flake_description || source.package_description,
          flakeName: source.flake_name,
          revision: source.revision,
          owner: source.flake_resolved.owner,
          repo: source.flake_resolved.repo,
          sourceUrl,
          score: hit._score,
          pname: source.package_pname,
          platforms: source.package_platforms,
          maintainers: source.package_maintainers_set.join(", "),
          licenses: source.package_license_set.join(", "),
        };
      } else {
        // If no flake data, create a basic flake item from package data
        // This allows showing packages that might be flakes even if not indexed as such
        const sourceUrl =
          source.package_homepage?.[0] ||
          `https://github.com/NixOS/nixpkgs/blob/master/${source.package_position?.split(":")[0] || ""}`;

        flake = {
          name: source.package_attr_name,
          description: source.package_description || "Nix package",
          flakeName: source.package_attr_name, // Use package name as flake name
          revision: "unknown",
          owner: "NixOS", // Default to NixOS
          repo: "nixpkgs", // Default to nixpkgs
          sourceUrl,
          score: hit._score,
          pname: source.package_pname,
          platforms: source.package_platforms,
          maintainers: source.package_maintainers_set.join(", "),
          licenses: source.package_license_set.join(", "),
        };
      }

      const key = `${flake.name}-${flake.revision}`;
      if (!flakeMap.has(key)) {
        flakeMap.set(key, flake);
      }
    });

    return Array.from(flakeMap.values()).sort((a, b) => b.score - a.score);
  } catch (error) {
    console.error("Failed to search Nix flake packages:", error);
    throw error;
  }
}

export async function searchHomeManagerOptions(query: string): Promise<HomeManagerOptionItem[]> {
  const url = preferences.homeManagerOptionsUrl;

  const headers = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    Referer: "https://home-manager-options.extranix.com/?query=&release=master",
    "Sec-GPC": "1",
    Connection: "keep-alive",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    TE: "trailers",
  };

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(`Home-Manager options request failed: ${response.status}`);
    }

    const data: HomeManagerOptionResponse = await response.json();

    // Filter options based on query (case-insensitive search in title and description)
    const filteredOptions = data.options.filter(
      (option) =>
        (typeof option.title === "string" && option.title.toLowerCase().includes(query.toLowerCase())) ||
        (typeof option.description === "string" && option.description.toLowerCase().includes(query.toLowerCase())),
    );

    // Sort by relevance (exact title match first, then description match)
    const sortedOptions = filteredOptions.sort((a, b) => {
      const aTitleMatch = typeof a.title === "string" && a.title.toLowerCase().includes(query.toLowerCase());
      const bTitleMatch = typeof b.title === "string" && b.title.toLowerCase().includes(query.toLowerCase());

      if (aTitleMatch && !bTitleMatch) return -1;
      if (!aTitleMatch && bTitleMatch) return 1;

      // If both match titles or both don't, sort by title
      const aTitle = typeof a.title === "string" ? a.title : "";
      const bTitle = typeof b.title === "string" ? b.title : "";
      return aTitle.localeCompare(bTitle);
    });

    // Convert to HomeManagerOptionItem format
    const optionItems: HomeManagerOptionItem[] = sortedOptions.map((option, index) => ({
      name: typeof option.title === "string" ? option.title : "",
      description: cleanText(typeof option.description === "string" ? option.description : ""),
      type: typeof option.type === "string" ? option.type : "",
      default: typeof option.default === "string" ? option.default : undefined,
      example: typeof option.example === "string" ? cleanText(option.example) : undefined,
      sourceUrl:
        option.declarations &&
        Array.isArray(option.declarations) &&
        option.declarations.length > 0 &&
        option.declarations[0]?.url
          ? option.declarations[0].url
          : undefined,
      score: sortedOptions.length - index, // Higher score for better matches
    }));

    return optionItems;
  } catch (error) {
    console.error("Failed to search Home-Manager options:", error);
    throw error;
  }
}

export async function searchNixpkgsPRs(query: string): Promise<PullRequest[]> {
  const token = preferences.githubToken;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `https://api.github.com/search/issues?q=${query}+repo:NixOS/nixpkgs+type:pr`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);

  const json = await res.json();

  return json.items
    .filter((i: any) => i.pull_request || !query.trim())
    .map((i: any) => ({
      number: i.number,
      title: i.title,
      pr_url: i.html_url,
      state: i.state,
      username: i.user?.login ?? "unknown",
      updated_at: i.updated_at,
      merged_at: i.pull_request?.merged_at ?? i.merged_at ?? null,
    }));
}

export async function getNixpkgsPR(number: number): Promise<FullPullRequest> {
  const token = preferences.githubToken;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`https://api.github.com/repos/NixOS/nixpkgs/pulls/${number}`, {
    headers,
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const data = await res.json();

  return {
    number: data.number,
    title: data.title,
    pr_url: data.html_url,
    state: data.state,
    username: data.user?.login ?? "unknown",
    created_at: data.created_at,
    updated_at: data.updated_at,
    body: data.body ?? "",
    merged_at: data.merged_at ?? null,
    labels: data.labels?.map((l: any) => ({ id: l.id, name: l.name, color: l.color })),
    reviewers: data.requested_reviewers?.map((r: any) => r.login) ?? [],
    from_branch: data.head?.ref ?? "unknown",
    to_branch: data.base?.ref ?? "unknown",
  };
}
