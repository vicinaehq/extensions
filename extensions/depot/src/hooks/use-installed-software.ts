import { useEffect, useState } from "react";
import { aptBackend } from "../backends/apt";
import type { FlatpakBackend } from "../backends/flatpak";
import { operationErrorMessage } from "../errors.ts";
import type { SoftwareItem } from "../types";
import { isProcessAborted } from "../utils/process";
import { softwareItemKey } from "../utils/software-results";

export interface InstalledSoftwareState {
  aptPackages: SoftwareItem[];
  flatpakPackages: SoftwareItem[];
  isLoading: boolean;
  aptError?: string;
  flatpakError?: string;
  removeFromList(pkg: SoftwareItem): void;
  refresh(): void;
}

export function useInstalledSoftware(
  flatpakBackend: FlatpakBackend,
  aptEnabled = true,
  flatpakEnabled = true,
): InstalledSoftwareState {
  const [aptPackages, setAptPackages] = useState<SoftwareItem[]>([]);
  const [flatpakPackages, setFlatpakPackages] = useState<SoftwareItem[]>([]);
  const [aptLoading, setAptLoading] = useState(aptEnabled);
  const [flatpakLoading, setFlatpakLoading] = useState(flatpakEnabled);
  const [aptError, setAptError] = useState<string>();
  const [flatpakError, setFlatpakError] = useState<string>();
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setAptLoading(aptEnabled);
    setFlatpakLoading(flatpakEnabled);
    setAptError(undefined);
    setFlatpakError(undefined);

    if (aptEnabled) {
      aptBackend.listInstalled(controller.signal)
        .then(setAptPackages)
        .catch((error: unknown) => {
          if (isProcessAborted(error)) return;
          console.error("Unable to list installed APT applications", error);
          setAptPackages([]);
          setAptError(operationErrorMessage(
            error,
            "Installed APT applications could not be loaded",
          ));
        })
        .finally(() => {
          if (!controller.signal.aborted) setAptLoading(false);
        });
    } else {
      setAptPackages([]);
    }

    if (flatpakEnabled) {
      flatpakBackend.listInstalled(controller.signal)
        .then(setFlatpakPackages)
        .catch((error: unknown) => {
          if (isProcessAborted(error)) return;
          console.error("Unable to list installed Flatpak applications", error);
          setFlatpakPackages([]);
          setFlatpakError(operationErrorMessage(
            error,
            "Installed Flatpak applications could not be loaded",
          ));
        })
        .finally(() => {
          if (!controller.signal.aborted) setFlatpakLoading(false);
        });
    } else {
      setFlatpakPackages([]);
    }

    return () => controller.abort();
  }, [aptEnabled, flatpakBackend, flatpakEnabled, generation]);

  return {
    aptPackages,
    flatpakPackages,
    isLoading: aptLoading || flatpakLoading,
    aptError,
    flatpakError,
    removeFromList: (pkg: SoftwareItem) => {
      const key = softwareItemKey(pkg);
      if (pkg.source === "apt") {
        setAptPackages((packages) =>
          packages.filter((item) => softwareItemKey(item) !== key)
        );
        return;
      }
      setFlatpakPackages((packages) =>
        packages.filter((item) => softwareItemKey(item) !== key)
      );
    },
    refresh: () => setGeneration((value) => value + 1),
  };
}
