import { useQuery } from "@tanstack/react-query";
import { octokit } from "../api/githubClient";
import { Issue } from "../types";
import { octokitPaginate } from "../api/octokitPaginate";
import { getIssueFilterQuery } from "../utils/getIssueFilterQuery";

const defaultValue: Issue[] = [];
export const useGetIssues = (filter: string, query = "") => {
  const q = getIssueFilterQuery(filter, "issue", query);
  return useQuery<Issue[]>({
    queryKey: ["githubIssues", q, filter],
    queryFn: async () => {
      if (!filter) return defaultValue;
      return octokitPaginate(octokit.search.issuesAndPullRequests, {
        q,
        sort: "updated",
        order: "desc",
        per_page: 100,
      });
    },
  });
};
