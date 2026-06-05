import { detect } from "package-manager-detector/detect";

export type PackageManager = "npm" | "pnpm" | "bun";

export const getPackageManager = async (
  path: string,
): Promise<PackageManager> => {
  const detectedPackageManager = await detect({ cwd: path });
  if (detectedPackageManager?.name === "bun") return "bun";
  if (detectedPackageManager?.name === "pnpm") return "pnpm";
  return "npm";
};
