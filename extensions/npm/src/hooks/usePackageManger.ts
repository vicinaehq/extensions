import { useEffect, useState } from "react";
import {
  getPackageManager,
  type PackageManager,
} from "../utils/getPackageManager";
import { getPreferenceValues } from "@vicinae/api";

export const usePackageManger = (path?: string) => {
  const preferences = getPreferenceValues<{
    packageManager: PackageManager;
  }>();
  const [packageManager, setPackageManager] = useState<PackageManager>(
    preferences.packageManager,
  );

  useEffect(() => {
    if (!path) return;
    getPackageManager(path).then(setPackageManager);
  }, [path]);

  return {
    packageManager,
  };
};
