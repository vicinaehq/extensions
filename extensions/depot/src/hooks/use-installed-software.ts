import { useEffect, useState } from "react";
import { aptBackend } from "../backends/apt.ts";
import { isFlatpakUnavailable, type FlatpakBackend } from "../backends/flatpak.ts";
import { operationErrorMessage } from "../errors.ts";
import type { SoftwareItem } from "../types.ts";
import { isProcessAborted } from "../utils/process.ts";
import { softwareItemKey } from "../utils/software-results.ts";

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
          setFlatpakPackages([]);
          // Flatpak is optional; an absent installation is not an error.
          if (isFlatpakUnavailable(error)) return;
          console.error("Unable to list installed Flatpak applications", error);
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
