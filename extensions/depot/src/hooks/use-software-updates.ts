import { useEffect, useState } from "react";
import { AptOperationError, aptBackend } from "../backends/apt";
import {
  FlatpakOperationError,
  type FlatpakBackend,
} from "../backends/flatpak";
import type { SoftwareUpdate } from "../types";
import { isProcessAborted } from "../utils/process";

export interface SoftwareUpdatesState {
  aptUpdates: SoftwareUpdate[];
  flatpakUpdates: SoftwareUpdate[];
  isLoading: boolean;
  aptError?: string;
  flatpakError?: string;
  forget(update: SoftwareUpdate): void;
  reload(): void;
}

export function useSoftwareUpdates(
  flatpakBackend: FlatpakBackend,
  aptEnabled = true,
  flatpakEnabled = true,
): SoftwareUpdatesState {
  const [aptUpdates, setAptUpdates] = useState<SoftwareUpdate[]>([]);
  const [flatpakUpdates, setFlatpakUpdates] = useState<SoftwareUpdate[]>([]);
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
      aptBackend.listUpdates(controller.signal)
        .then(setAptUpdates)
        .catch((error: unknown) => {
          if (isProcessAborted(error)) return;
          console.error("Unable to list APT updates", error);
          setAptUpdates([]);
          setAptError(error instanceof AptOperationError
            ? error.message
            : "APT updates could not be loaded");
        })
        .finally(() => {
          if (!controller.signal.aborted) setAptLoading(false);
        });
    } else {
      setAptUpdates([]);
    }

    if (flatpakEnabled) {
      flatpakBackend.listUpdates(controller.signal)
        .then(setFlatpakUpdates)
        .catch((error: unknown) => {
          if (isProcessAborted(error)) return;
          console.error("Unable to list Flatpak updates", error);
          setFlatpakUpdates([]);
          setFlatpakError(error instanceof FlatpakOperationError
            ? error.message
            : "Flatpak updates could not be loaded");
        })
        .finally(() => {
          if (!controller.signal.aborted) setFlatpakLoading(false);
        });
    } else {
      setFlatpakUpdates([]);
    }

    return () => controller.abort();
  }, [aptEnabled, flatpakBackend, flatpakEnabled, generation]);

  return {
    aptUpdates,
    flatpakUpdates,
    isLoading: aptLoading || flatpakLoading,
    aptError,
    flatpakError,
    forget: (update: SoftwareUpdate) => {
      if (update.source === "apt") {
        setAptUpdates((updates) => updates.filter((item) => item.id !== update.id));
        return;
      }
      setFlatpakUpdates((updates) => updates.filter((item) =>
        item.id !== update.id || item.flatpak?.scope !== update.flatpak?.scope
      ));
    },
    reload: () => setGeneration((value) => value + 1),
  };
}
