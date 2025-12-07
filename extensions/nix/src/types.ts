export interface AggregationBucket {
  key: string;
  doc_count: number;
}

export interface Aggregation {
  doc_count_error_upper_bound: number;
  sum_other_doc_count: number;
  buckets: AggregationBucket[];
}

export interface NixHit<T = unknown> {
  _index: string;
  _type: string;
  _id: string;
  _score: number;
  _source: T;
  sort: number[];
  matched_queries: string[];
}

export interface NixResponse<T = unknown> {
  took: number;
  timed_out: boolean;
  _shards: {
    total: number;
    successful: number;
    skipped: number;
    failed: number;
  };
  hits: {
    total: {
      value: number;
      relation: string;
    };
    max_score: number | null;
    hits: NixHit<T>[];
  };
  aggregations: {
    package_attr_set: Aggregation;
    package_license_set: Aggregation;
    package_maintainers_set: Aggregation;
    package_teams_set: Aggregation;
    package_platforms: Aggregation;
    all: {
      doc_count: number;
      package_attr_set: Aggregation;
      package_license_set: Aggregation;
      package_maintainers_set: Aggregation;
      package_teams_set: Aggregation;
      package_platforms: Aggregation;
    };
  };
}

export interface NixPackage {
  type: string;
  package_attr_name: string;
  package_attr_set: string;
  package_pname: string;
  package_pversion: string;
  package_platforms: string[];
  package_outputs: string[];
  package_default_output: string;
  package_programs: string[];
  package_mainProgram: string | null;
  package_license: Array<{
    url: string;
    fullName: string;
  }>;
  package_license_set: string[];
  package_maintainers: Array<{
    name: string;
    github: string;
    email: string;
  }>;
  package_maintainers_set: string[];
  package_teams: Array<{
    members: Array<{
      name: string;
      github: string;
      email: string;
    }>;
    scope: string;
    shortName: string;
    githubTeams: string[];
  }>;
  package_teams_set: string[];
  package_description: string | null;
  package_longDescription: string | null;
  package_hydra: { [key: string]: unknown } | null;
  package_system: string;
  package_homepage: string[];
  package_position: string;
}

export type NixPackageResponse = NixResponse<NixPackage>;

export interface NixOption {
  type: string;
  option_name: string;
  option_description: string;
  option_flake: string | null;
  option_type: string;
  option_default?: string;
  option_example?: string;
  option_source?: string;
}

export type NixOptionResponse = NixResponse<NixOption>;

export interface NixFlake {
  type: string;
  flake_description: string;
  flake_resolved: {
    type: string;
    url: string;
  };
  flake_name: string;
  revision: string;
  flake_source: {
    type: string;
    url: string;
  };
  package_attr_name: string;
  package_attr_set: string;
  package_pname: string;
  package_pversion: string;
  package_platforms: string[];
  package_outputs: string[];
  package_default_output: string;
  package_programs: string[];
  package_mainProgram: string | null;
  package_license: Array<{
    url: string;
    fullName: string;
  }>;
  package_license_set: string[];
  package_maintainers: Array<{
    name: string | null;
    github: string;
    email: string | null;
  }>;
  package_maintainers_set: string[];
  package_teams: Array<{
    members: Array<{
      name: string;
      github: string;
      email: string;
    }>;
    scope: string;
    shortName: string;
    githubTeams: string[];
  }>;
  package_teams_set: string[];
  package_description: string;
  package_longDescription: string | null;
  package_hydra: unknown | null;
  package_system: string;
  package_homepage: string[];
  package_position: string | null;
}

export type NixFlakeResponse = NixResponse<NixFlake>;

export interface HomeManagerOption {
  title: string;
  description: string;
  type: string;
  default: string;
  example: string;
  declarations: Array<{
    name: string;
    url: string;
  }>;
  loc: string[];
  readOnly: boolean;
}

export interface HomeManagerOptionResponse {
  last_update: string;
  options: HomeManagerOption[];
}

export interface GitHubUser {
  login: string;
  name?: string | null;
  email?: string | null;
}

export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  user: GitHubUser | null;
  updated_at: string;
  pull_request?: {
    merged_at: string | null;
  };
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  user: GitHubUser | null;
  created_at: string;
  updated_at: string;
  body: string | null;
  merged_at: string | null;
  labels: GitHubLabel[];
  requested_reviewers: GitHubUser[];
  availableOn: string[];
  head: {
    ref: string;
  } | null;
  base: {
    ref: string;
  } | null;
}
