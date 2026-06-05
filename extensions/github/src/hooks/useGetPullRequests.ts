import { useQuery } from "@tanstack/react-query";
import { octokit } from "../api/githubClient";
import { FilterType, PullRequest } from "../types";
import { getPullRequestFilterQuery } from "../utils/getPullRequestFilterQuery";
import { octokitPaginate } from "../api/octokitPaginate";

export const useGetPullRequests = (filter: FilterType, query = "") => {
  const q = getPullRequestFilterQuery(filter, query);
  return useQuery<PullRequest[]>({
    queryKey: ["githubPrs", q, filter],
    queryFn: async () => {
      return octokitPaginate(octokit.search.issuesAndPullRequests, {
        q,
        sort: "updated",
        order: "desc",
        per_page: 100,
      });
    },
  });
};
