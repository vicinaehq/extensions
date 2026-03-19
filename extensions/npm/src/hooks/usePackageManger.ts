import { useEffect, useState } from "react";
import {
  getPackageManager,
  type PackageManager,
} from "../utils/getPackageManager";

export const usePackageManger = (pwd: string) => {
  const [packageManager, setPackageManager] = useState<PackageManager>("npm");

  useEffect(() => {
    getPackageManager(pwd).then(setPackageManager);
  }, [pwd]);

  return {
    packageManager,
  };
};
