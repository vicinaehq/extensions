import { useQuery } from "@tanstack/react-query";

import { octokit } from "../api/githubClient";
import { octokitPaginate } from "../api/octokitPaginate";
import { Organization } from "../types";

export const useGetOrganizations = () => {
  return useQuery<Organization[]>({
    queryKey: ["organizations"],
    queryFn: async () => {
      return octokitPaginate(octokit.orgs.listForAuthenticatedUser, {
        per_page: 100,
      });
    },
  });
};
