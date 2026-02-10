export type GitHubPreferences = {
  personalAccessToken: string;
  numberOfResults?: string;
  defaultIssueFilter?: "my-issues" | "assigned" | "mentioning" | "all";
};

export type GitHubPreferencesMinimal = {
  personalAccessToken: string;
  numberOfResults?: string;
  defaultRepositoryFilter?: "all" | "my";
};