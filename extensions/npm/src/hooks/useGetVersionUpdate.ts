import { useFetch } from "@raycast/utils";
import semver from "semver";
import type { Package } from "../types";

export const useGetVersionUpdate = (npmPackage: Package) => {
  const encodedName = encodeURIComponent(npmPackage.name);

  const { data, isLoading } = useFetch(
    `https://registry.npmjs.com/${encodedName}`,
    {
      parseResponse: async (response) => {
        const data = (await response.json()) as Response;
        const latestVersion = data["dist-tags"].latest;
        const latestSemver = semver.coerce(latestVersion);
        const currentSemver = semver.coerce(npmPackage.version);
        const hasUpdate =
          latestSemver !== null &&
          currentSemver !== null &&
          semver.gt(latestSemver, currentSemver);
        return {
          hasUpdate,
          versionData: {
            name: npmPackage.name,
            version: npmPackage.version,
            hasUpdate,
            newVersion: latestVersion,
          },
        } as const;
      },
    },
  );

  if (data) return data;
  return { hasUpdate: false, isLoading, versionData: undefined };
};

type Response = {
  name: string;
  "dist-tags": {
    latest: string;
  };
};
