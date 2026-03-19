import semver from "semver";

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
  const latestSemver = semver.coerce(latestVersion);
  const currentSemver = semver.coerce(version);
  const hasUpdate =
    latestSemver !== null &&
    currentSemver !== null &&
    semver.gt(latestSemver, currentSemver);

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
