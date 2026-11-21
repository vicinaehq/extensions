import { useEffect, useState } from "react";
import { aptBackend } from "../backends/apt.ts";
import type { FlatpakBackend } from "../backends/flatpak.ts";
import { describeOperationError, type OperationFailure } from "../errors.ts";
import type { SoftwareUpdate } from "../types.ts";
import { isProcessAborted } from "../utils/process.ts";
import { removeSoftwareUpdates } from "../utils/software-results.ts";

export interface SoftwareUpdatesState {
  aptUpdates: SoftwareUpdate[];
  flatpakUpdates: SoftwareUpdate[];
  isLoading: boolean;
  aptError?: OperationFailure;
  flatpakError?: OperationFailure;
  removeCompleted(completed: readonly SoftwareUpdate[]): void;
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
  const [aptError, setAptError] = useState<OperationFailure>();
  const [flatpakError, setFlatpakError] = useState<OperationFailure>();
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
          setAptError(describeOperationError(
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
          setFlatpakError(describeOperationError(
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
    removeCompleted: (completed: readonly SoftwareUpdate[]) => {
      setAptUpdates((updates) => removeSoftwareUpdates(updates, completed));
      setFlatpakUpdates((updates) => removeSoftwareUpdates(updates, completed));
    },
    refresh: () => setGeneration((value) => value + 1),
  };
}
