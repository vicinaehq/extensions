import { useQuery } from "@tanstack/react-query";
import { octokit } from "../api/githubClient";
import { FilterType, GitHubPreferences } from "../types";
import { getPreferenceValues } from "@vicinae/api";
import { getIssueFilterQuery } from "../utils/getIssueFilterQuery";

const preferences = getPreferenceValues<GitHubPreferences>();

export const useGitHubIssues = (filter: FilterType, query = "") => {
  const q = getIssueFilterQuery(filter, "issue", query);
  return useQuery({
    queryKey: ["githubIssues", q],
    queryFn: async () => {
      const response = await octokit.search.issuesAndPullRequests({
        q,
        sort: "updated",
        order: "desc",
        per_page: parseInt(preferences.numberOfResults || "100"),
      });
      return response.data.items;
    },
  });
};
