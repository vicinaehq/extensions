import semver from "semver";
import { Package } from "../types";

export const hasUpdate = (pkg: Package) => {
  const latestSemver = semver.coerce(pkg.newVersion);
  const currentSemver = semver.coerce(pkg.version);
  return (
    latestSemver !== null &&
    currentSemver !== null &&
    semver.gt(latestSemver, currentSemver)
  );
};
