import { useQuery } from "@tanstack/react-query";
import { octokit } from "../api/githubClient";
import { FilterType } from "../types";
import { getIssueFilterQuery } from "../utils/getIssueFilterQuery";

export const useGetIssues = (filter: FilterType, query = "") => {
  const q = getIssueFilterQuery(filter, "issue", query);
  return useQuery({
    queryKey: ["githubIssues", q, filter],
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
