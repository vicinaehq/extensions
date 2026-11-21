import { basename, extname } from "node:path";
import type { SoftwareBundle } from "./package-bundles.ts";
import type { SoftwareProfile } from "./software-profiles.ts";

export interface ProfileAppImageReview {
  id: string;
  identifier: string;
  title: string;
  description: string;
  source: string;
  status: "installed" | "requires-user-action";
}

export function profileBundle(
  profile: SoftwareProfile,
  filePath: string,
): SoftwareBundle {
  return {
    id: `profile:${filePath}`,
    name: basename(filePath, extname(filePath)),
    description: "Packages imported from a Depot software profile.",
    packages: [
      ...profile.apt.map((id) => ({ source: "apt" as const, id })),
      ...profile.flatpak.map((id) => ({ source: "flatpak" as const, id })),
    ],
  };
}

export function profileAppImageReviewItems(
  profile: SoftwareProfile,
  installedFileNames: ReadonlySet<string>,
  inspectionError?: string,
): ProfileAppImageReview[] {
  return profile.appImages.map((appImage) => {
    const installed = installedFileNames.has(appImage.filename);
    return {
      id: `appimage:${appImage.filename}`,
      identifier: appImage.filename,
      title: appImage.name,
      description: inspectionError
        ? `Installed AppImages could not be checked: ${inspectionError}`
        : installed
        ? `${appImage.filename} is already present in ~/Applications.`
        : "No trusted download source is stored; install this AppImage manually.",
      source: appImage.source === "managed"
        ? "AppImage · Depot metadata"
        : "AppImage · External metadata",
      status: !inspectionError && installed
        ? "installed"
        : "requires-user-action",
    };
  });
}
