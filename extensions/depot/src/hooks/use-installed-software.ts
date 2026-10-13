import { useEffect, useState } from "react";
import { AptOperationError, aptBackend } from "../backends/apt";
import {
  FlatpakOperationError,
  type FlatpakBackend,
} from "../backends/flatpak";
import type { SoftwarePackage } from "../types";
import { isProcessAborted } from "../utils/process";

export interface InstalledSoftwareState {
  aptPackages: SoftwarePackage[];
  flatpakPackages: SoftwarePackage[];
  isLoading: boolean;
  aptError?: string;
  flatpakError?: string;
  forget(pkg: SoftwarePackage): void;
  refresh(): void;
}

export function useInstalledSoftware(
  flatpakBackend: FlatpakBackend,
  aptEnabled = true,
  flatpakEnabled = true,
): InstalledSoftwareState {
  const [aptPackages, setAptPackages] = useState<SoftwarePackage[]>([]);
  const [flatpakPackages, setFlatpakPackages] = useState<SoftwarePackage[]>([]);
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
          setAptError(error instanceof AptOperationError
            ? error.message
            : "Installed APT applications could not be loaded");
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
          setFlatpakError(error instanceof FlatpakOperationError
            ? error.message
            : "Installed Flatpak applications could not be loaded");
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
    forget: (pkg: SoftwarePackage) => {
      if (pkg.source === "apt") {
        setAptPackages((packages) => packages.filter((item) => item.id !== pkg.id));
        return;
      }
      setFlatpakPackages((packages) => packages.filter((item) =>
        item.id !== pkg.id || item.flatpak?.scope !== pkg.flatpak?.scope
      ));
    },
    refresh: () => setGeneration((value) => value + 1),
  };
}
