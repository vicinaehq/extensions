import { useQuery } from "@tanstack/react-query";
import { octokit } from "../api/githubClient";
import { GitHubPreferencesMinimal } from "../types";
import { getPreferenceValues, showToast, Toast } from "@vicinae/api";
import { RequestError } from "@octokit/request-error";

const { numberOfResults } = getPreferenceValues<GitHubPreferencesMinimal>();

export const ALL_REPOSITORIES_SCOPE = "all";
export const MY_REPOSITORIES_SCOPE = "my-repositories";
export const ORGANIZATION_SCOPE_PREFIX = "organization:";

export type RepositorySearchScope =
  | typeof ALL_REPOSITORIES_SCOPE
  | typeof MY_REPOSITORIES_SCOPE
  | `${typeof ORGANIZATION_SCOPE_PREFIX}${string}`;

const buildSearchQuery = (
  query: string,
  scope: RepositorySearchScope,
) => {
  if (scope === ALL_REPOSITORIES_SCOPE) {
    return query;
  }

  return `${query} org:${scope.slice(ORGANIZATION_SCOPE_PREFIX.length)}`;
};

export const useSearchRepos = (
  query: string,
  scope: RepositorySearchScope,
  enabled = false,
) => {
  return useQuery({
    queryKey: ["githubRepos", query, scope],
    queryFn: async () => {
      try {
        const response = await octokit.search.repos({
          q: buildSearchQuery(query, scope),
          sort: "updated",
          order: "desc",
          per_page: parseInt(numberOfResults || "100"),
        });
        return response.data.items;
      } catch (error) {
        if (error instanceof RequestError) {
          showToast({
            title: error.message,
            style: Toast.Style.Failure,
          });
        }
        return [];
      }
    },
    enabled: enabled && !!query.trim(), // Don't run query if search text is empty
  });
};
