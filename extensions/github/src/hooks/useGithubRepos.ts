import { useQuery } from "@tanstack/react-query";
import { octokit } from "../api/githubClient";
import { GitHubPreferencesMinimal } from "../types";
import { getPreferenceValues } from "@vicinae/api";

const { numberOfResults } = getPreferenceValues<GitHubPreferencesMinimal>();

export const useMyGithubRepos = () => {
  return useQuery({
    queryKey: ["myGithubRepos"],
    queryFn: async () => {
      return octokit.paginate(octokit.repos.listForAuthenticatedUser, {
        sort: "updated",
        direction: "desc",
        affiliation: "owner,collaborator,organization_member",
      });
    },
  });
};

export const useSearchGithubRepos = (query: string, enabled = false) => {
  return useQuery({
    queryKey: ["githubRepos", query],
    queryFn: async () => {
      const response = await octokit.search.repos({
        q: query,
        sort: "updated",
        order: "desc",
        per_page: parseInt(numberOfResults || "100"),
      });
      return response.data.items;
    },
    enabled: enabled && !!query.trim(), // Don't run query if search text is empty
  });
};
