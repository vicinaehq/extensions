import { getPreferenceValues } from "@vicinae/api";
import type {
  NixPackageResponse,
  NixOptionResponse,
  NixPackage,
  NixOption,
  NixFlakeResponse,
  NixFlake,
  HomeManagerOption,
  HomeManagerOptionResponse,
  GitHubIssue,
  GitHubPullRequest,
} from "./types";

interface Preferences {
  searchUrl: string;
  authToken: string;
  homeManagerOptionsUrl: string;
  githubToken: string;
}

const preferences = getPreferenceValues<Preferences>();

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

export async function searchNixPackages(query: string): Promise<NixPackage[]> {
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

    return data.hits.hits.map((hit) => hit._source as NixPackage);
  } catch (error) {
    console.error("Failed to search Nix packages:", error);
    throw error;
  }
}

export async function searchNixOptions(query: string): Promise<NixOption[]> {
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

    return data.hits.hits.map((hit) => hit._source as NixOption);
  } catch (error) {
    console.error("Failed to search Nix options:", error);
    throw error;
  }
}

export async function searchNixFlakes(query: string): Promise<NixFlake[]> {
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

    return data.hits.hits.map((hit) => hit._source as NixFlake);
  } catch (error) {
    console.error("Failed to search Nix flake packages:", error);
    throw error;
  }
}

export async function searchHomeManagerOptions(query: string): Promise<HomeManagerOption[]> {
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
    return data.options.filter(
      (option) =>
        (typeof option.title === "string" && option.title.toLowerCase().includes(query.toLowerCase())) ||
        (typeof option.description === "string" && option.description.toLowerCase().includes(query.toLowerCase())),
    );
  } catch (error) {
    console.error("Failed to search Home-Manager options:", error);
    throw error;
  }
}

export async function searchNixpkgsPullRequests(query: string): Promise<GitHubIssue[]> {
  const token = preferences.githubToken;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `https://api.github.com/search/issues?q=${query}+repo:NixOS/nixpkgs+type:pr`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);

  const json = await res.json();

  return json.items.filter((i: GitHubIssue) => i.pull_request || !query.trim());
}

export async function getNixpkgsPullRequest(number: number): Promise<GitHubPullRequest> {
  const token = preferences.githubToken;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`https://api.github.com/repos/NixOS/nixpkgs/pulls/${number}`, {
    headers,
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const data: GitHubPullRequest = await res.json();

  const res_status = await fetch(`https://nixpkgs.molybdenum.software/api/v2/landings/${number}`);
  if (!res_status.ok) throw new Error(`PR Status ${res_status.status}`);

  const statusData = await res_status.json();
  data.availableOn = statusData.branches;

  return data;
}

