import { useQuery } from "@tanstack/react-query";
import { octokit } from "../api/githubClient";
import { Repository } from "../types";
import { octokitPaginate } from "../api/octokitPaginate";

export const useGetMyRepos = () => {
  return useQuery<Repository[]>({
    queryKey: ["myRepos"],
    queryFn: async () => {
      return octokitPaginate(octokit.repos.listForAuthenticatedUser, {
        sort: "updated",
        direction: "desc",
        affiliation: "owner,collaborator,organization_member",
      });
    },
  });
};
