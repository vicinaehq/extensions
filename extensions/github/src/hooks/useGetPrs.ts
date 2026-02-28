import { useQuery } from "@tanstack/react-query";
import { octokit } from "../api/githubClient";
import { FilterType } from "../types";
import { getPrFilterQuery } from "../utils/getPrFilterQuery";

export const useGetPrs = (filter: FilterType, query = "") => {
  const q = getPrFilterQuery(filter, query);
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
