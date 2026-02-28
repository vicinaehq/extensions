export type GitHubPreferences = {
  personalAccessToken: string;
  numberOfResults?: string;
  defaultIssueFilter?: "my" | "assigned" | "mentioning" | "all";
};

export type GitHubPreferencesMinimal = {
  personalAccessToken: string;
  numberOfResults?: string;
  defaultRepositoryFilter?: "all" | "my";
};

export type FilterType = "my" | "assigned" | "mentioning" | "all";
