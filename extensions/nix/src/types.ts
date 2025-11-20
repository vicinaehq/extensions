// Common response types
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
    package_attr_set: {
      doc_count_error_upper_bound: number;
      sum_other_doc_count: number;
      buckets: Array<{
        key: string;
        doc_count: number;
      }>;
    };
    package_license_set: {
      doc_count_error_upper_bound: number;
      sum_other_doc_count: number;
      buckets: Array<{
        key: string;
        doc_count: number;
      }>;
    };
    package_maintainers_set: {
      doc_count_error_upper_bound: number;
      sum_other_doc_count: number;
      buckets: Array<{
        key: string;
        doc_count: number;
      }>;
    };
    package_teams_set: {
      doc_count_error_upper_bound: number;
      sum_other_doc_count: number;
      buckets: Array<{
        key: string;
        doc_count: number;
      }>;
    };
    package_platforms: {
      doc_count_error_upper_bound: number;
      sum_other_doc_count: number;
      buckets: Array<{
        key: string;
        doc_count: number;
      }>;
    };
    all: {
      doc_count: number;
      package_attr_set: {
        doc_count_error_upper_bound: number;
        sum_other_doc_count: number;
        buckets: Array<{
          key: string;
          doc_count: number;
        }>;
      };
      package_license_set: {
        doc_count_error_upper_bound: number;
        sum_other_doc_count: number;
        buckets: Array<{
          key: string;
          doc_count: number;
        }>;
      };
      package_maintainers_set: {
        doc_count_error_upper_bound: number;
        sum_other_doc_count: number;
        buckets: Array<{
          key: string;
          doc_count: number;
        }>;
      };
      package_teams_set: {
        doc_count_error_upper_bound: number;
        sum_other_doc_count: number;
        buckets: Array<{
          key: string;
          doc_count: number;
        }>;
      };
      package_platforms: {
        doc_count_error_upper_bound: number;
        sum_other_doc_count: number;
        buckets: Array<{
          key: string;
          doc_count: number;
        }>;
      };
    };
  };
}

// Package types
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

export interface PackageItem {
  name: string;
  version: string;
  description: string;
  homepage: string;
  licenses: string;
  sourceUrl: string;
  score: number;
  pname: string;
  platforms: string[];
  maintainers: string;
  longDescription: string | null;
}

// Option types
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

export interface OptionItem {
  name: string;
  description: string;
  flake: string | null;
  type: string;
  default?: string;
  example?: string;
  option_source?: string;
  sourceUrl?: string;
  score: number;
}

// Flake types
export interface NixFlake {
  type: string;
  flake_description: string;
  flake_resolved: {
    type: string;
    owner: string;
    repo: string;
  };
  flake_name: string;
  revision: string;
  flake_source: {
    type: string;
    owner: string;
    repo: string;
    description: string | null;
    git_ref: string | null;
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

export interface FlakeItem {
  name: string;
  description: string;
  flakeName: string;
  revision: string;
  owner: string;
  repo: string;
  sourceUrl: string;
  score: number;
  pname: string;
  platforms: string[];
  maintainers: string;
  licenses: string;
}

// Home-Manager Option types
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

export interface HomeManagerOptionItem {
  name: string;
  description: string;
  type: string;
  default?: string;
  example?: string;
  sourceUrl?: string;
  score: number;
}

// Nixpkgs PR types
export interface Label {
  id: number;
  name: string;
  color?: string;
}

export interface PullRequest {
  number: number;
  title: string;
  pr_url: string;
  state: "open" | "closed";
  username: string;
  updated_at: string;
  merged_at?: string | null;
}

export interface FullPullRequest extends PullRequest {
  updated_at: string;
  body: string;
  labels?: Label[];
  reviewers?: string[];
  from_branch: string;
  to_branch: string;
}
