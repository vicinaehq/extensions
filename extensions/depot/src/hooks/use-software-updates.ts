import { useEffect, useState } from "react";
import { aptBackend } from "../backends/apt";
import type { FlatpakBackend } from "../backends/flatpak";
import { operationErrorMessage } from "../errors.ts";
import type { SoftwareUpdate } from "../types";
import { isProcessAborted } from "../utils/process";
import { softwareItemKey } from "../utils/software-results";

export interface SoftwareUpdatesState {
  aptUpdates: SoftwareUpdate[];
  flatpakUpdates: SoftwareUpdate[];
  isLoading: boolean;
  aptError?: string;
  flatpakError?: string;
  removeFromList(update: SoftwareUpdate): void;
  refresh(): void;
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
          setAptError(operationErrorMessage(
            error,
            "APT updates could not be loaded",
          ));
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
          setFlatpakError(operationErrorMessage(
            error,
            "Flatpak updates could not be loaded",
          ));
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
    removeFromList: (update: SoftwareUpdate) => {
      const key = softwareItemKey(update);
      if (update.source === "apt") {
        setAptUpdates((updates) =>
          updates.filter((item) => softwareItemKey(item) !== key)
        );
        return;
      }
      setFlatpakUpdates((updates) =>
        updates.filter((item) => softwareItemKey(item) !== key)
      );
    },
    refresh: () => setGeneration((value) => value + 1),
  };
}
