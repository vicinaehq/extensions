import { showToast, Toast } from "@vicinae/api";
import { execSync } from "child_process";
import { useState } from "react";
import type { PackageManager } from "../utils/getPackageManager";
import type { NPMPackage } from "./useNpmSeach";
import { usePackageManger } from "./usePackageManger";
import { getInstalledPackages } from "../utils/getPackageJson";
import { Package } from "../types";

export const useInstallPackages = (pwd?: string) => {
  const [selectedPackages, setSelectedPackages] = useState<NPMPackage[]>([]);
  const [error, setError] = useState<string>("");
  const { packageManager } = usePackageManger(pwd);
  const [installedPackages, setInstalledPackages] = useState<Package[]>(() =>
    getInstalledPackages(packageManager, pwd),
  );

  const npmCommand = buildInstallCommand(
    packageManager,
    selectedPackages,
    !pwd,
  );

  const installPackages = async (dev = false) => {
    const installToast = await showToast({
      title: `Installing packages...`,
      style: Toast.Style.Animated,
    });
    const command = buildInstallCommand(
      packageManager,
      selectedPackages,
      dev,
      !pwd,
    );
    try {
      if (selectedPackages.length > 0) {
        execSync(command, {
          cwd: pwd,
        });
      }
    } catch (error) {
      if (error instanceof Error) setError(error.message);
      installToast.hide();
      showToast({
        title: `Failed to install packages`,
        style: Toast.Style.Failure,
      });
      return;
    }
    installToast.hide();
    showToast({
      title: `Successfully installed packages`,
      style: Toast.Style.Success,
    });
    setInstalledPackages(getInstalledPackages(packageManager, pwd));
    setSelectedPackages([]);
  };

  const onSelectDependency = (dependency: NPMPackage) => {
    setSelectedPackages((prev) => {
      const alreadySelected = prev.some((dep) => dep.name === dependency.name);
      if (!alreadySelected) return [...prev, dependency];
      return prev.filter((dep) => dep.name !== dependency.name);
    });
  };

  const clearError = () => setError("");

  return {
    installPackages,
    error,
    installedPackages,
    selectedPackages,
    npmCommand,
    onSelectDependency,
    clearError,
  };
};

const buildInstallCommand = (
  packageManager: PackageManager,
  pkgNames: NPMPackage[],
  dev?: boolean,
  global = false,
) => {
  const pkgs = pkgNames.map((pkg) => pkg.name).join(" ");
  switch (packageManager) {
    case "pnpm":
      return `pnpm add ${global ? "-g" : ""} ${pkgs}${dev ? " --save-dev" : ""}`;
    case "bun":
      return `bun add ${global ? "-g" : ""} ${pkgs}${dev ? " -d" : ""}`;
    case "npm":
      return `npm install ${global ? "-g" : ""} ${pkgs}${dev ? " --save-dev" : ""}`;
  }
};
