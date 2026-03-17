import { useQuery } from "@tanstack/react-query";
import { octokit } from "../api/githubClient";
import { getIssueFilterQuery } from "../utils/getIssueFilterQuery";
import { Issue } from "../types";

const defaultValue: Issue[] = [];
export const useGetIssues = (filter: string, query = "") => {
  const q = getIssueFilterQuery(filter, "issue", query);
  return useQuery({
    queryKey: ["githubIssues", q, filter],
    queryFn: async () => {
      if (!filter) return defaultValue;
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
