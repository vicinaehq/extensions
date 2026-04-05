import { useEffect, useState } from "react";
import {
  getPackageManager,
  type PackageManager,
} from "../utils/getPackageManager";
import { getPreferenceValues } from "@vicinae/api";

export const usePackageManger = (pwd?: string) => {
  const preferences = getPreferenceValues<{
    packageManager: PackageManager;
  }>();
  const [packageManager, setPackageManager] = useState<PackageManager>(
    preferences.packageManager,
  );

  useEffect(() => {
    if (!pwd) return;
    getPackageManager(pwd).then(setPackageManager);
  }, [pwd]);

  return {
    packageManager,
  };
};
