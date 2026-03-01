import { useQuery } from "@tanstack/react-query";
import { octokit } from "../api/githubClient";
import { FilterType } from "../types";
import { getPullRequestFilterQuery } from "../utils/getPullRequestFilterQuery";

export const useGetPullRequests = (filter: FilterType, query = "") => {
  const q = getPullRequestFilterQuery(filter, query);
  return useQuery({
    queryKey: ["githubPrs", q, filter],
    queryFn: async () => {
      return octokit.paginate(
        octokit.search.issuesAndPullRequests,
        {
          q,
          sort: "updated",
          order: "desc",
          per_page: 100,
        },
        (response) => response.data,
      );
    },
  });
};
