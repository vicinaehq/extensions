import { Cache, showToast, Toast } from "@vicinae/api";
import { execSync } from "child_process";
import { useState } from "react";
import type { PackageManager } from "../utils/getPackageManager";
import type { Package } from "../types";
import { usePackageManger } from "./usePackageManger";
import { getInstalledPackages } from "../utils/getPackageJson";

export const useUpdatePackages = (path?: string) => {
  const [selectedDependencies, setSelectedDependencies] = useState<string[]>(
    [],
  );
  const [selectedDevDependencies, setSelectedDevDependencies] = useState<
    string[]
  >([]);
  const [error, setError] = useState<string>("");
  const { packageManager } = usePackageManger(path);
  const [packages, setPackages] = useState<Package[]>(() =>
    getInstalledPackages(packageManager, path),
  );

  const npmCommand = buildUpdateCommand(
    packageManager,
    selectedDependencies,
    selectedDevDependencies,
    !path,
  );

  const updatePackages = async () => {
    const updateToast = await showToast({
      title: `Updating packages...`,
      style: Toast.Style.Animated,
    });

    try {
      execSync(npmCommand, {
        cwd: path,
      });
    } catch (error) {
      if (error instanceof Error) setError(error.message);
      updateToast.hide();
      showToast({
        title: `Failed to update packages`,
        style: Toast.Style.Failure,
      });
      return;
    }
    updateToast.hide();
    showToast({
      title: `Successfully updated packages`,
      style: Toast.Style.Success,
    });
    setPackages(getInstalledPackages(packageManager, path));
    setSelectedDependencies([]);
    setSelectedDevDependencies([]);
  };

  const onSelectDevDependency = (dependency: string) => {
    setSelectedDevDependencies((prev) => {
      if (!prev.includes(dependency)) return [...prev, dependency];
      return prev.filter((dep) => dep !== dependency);
    });
  };

  const onSelectDependency = (dependency: string) => {
    setSelectedDependencies((prev) => {
      if (!prev.includes(dependency)) return [...prev, dependency];
      return prev.filter((dep) => dep !== dependency);
    });
  };

  const clearError = () => setError("");

  return {
    updatePackages,
    error,
    packages,
    selectedDependencies,
    selectedDevDependencies,
    onSelectDependency,
    onSelectDevDependency,
    clearError,
    npmCommand,
  };
};

const buildUpdateCommand = (
  packageManager: PackageManager,
  dependencies: string[],
  devDependencies: string[],
  global = false,
) => {
  const deps = dependencies.map((name) => `${name}@latest`).join(" ");
  const devDeps = devDependencies.map((name) => `${name}@latest`).join(" ");

  switch (packageManager) {
    case "pnpm":
      return [
        deps ? `pnpm update ${deps} ${global ? "-g" : ""}` : "",
        devDeps ? `pnpm update ${devDeps} -D` : "",
      ]
        .filter(Boolean)
        .join(" && ");
    case "bun":
      return [
        deps ? `bun add ${deps} ${global ? "-g" : ""}` : "",
        devDeps ? `bun add ${devDeps} -d` : "",
      ]
        .filter(Boolean)
        .join(" && ");
    case "npm":
      return [
        deps ? `npm install ${deps} ${global ? "-g" : ""}` : "",
        devDeps ? `npm install ${devDeps} --save-dev` : "",
      ]
        .filter(Boolean)
        .join(" && ");
  }
};
