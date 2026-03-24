import { useQuery } from "@tanstack/react-query";
import { octokit } from "../api/githubClient";

export const useGetMyRepos = () => {
  return useQuery({
    queryKey: ["myRepos"],
    queryFn: async () => {
      return octokit.paginate(octokit.repos.listForAuthenticatedUser, {
        sort: "updated",
        direction: "desc",
        affiliation: "owner,collaborator,organization_member",
      });
    },
  });
};
