import { compareVersions } from "compare-versions";

export const fetchPackageMetadata = async (
  packageName: string,
  version: string,
  signal: AbortSignal,
) => {
  const encodedName = encodeURIComponent(packageName);
  const registryUrl = `https://registry.npmjs.com/${encodedName}`;

  const res = await fetch(registryUrl, { signal });
  if (!res.ok) return null;

  const data = (await res.json()) as Response;

  const latestVersion = data["dist-tags"].latest;
  let hasUpdate = false;
  try {
    hasUpdate = compareVersions(latestVersion, version) > 0;
  } catch (error) {}

  return {
    name: data.name,
    version,
    hasUpdate,
    newVersion: latestVersion,
  };
};

type Response = {
  name: string;
  "dist-tags": {
    latest: string;
  };
};
