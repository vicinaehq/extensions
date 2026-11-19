import { useEffect, useState } from "react";
import {
  appImageKey,
  listInstalledAppImages,
  type InstalledAppImage,
} from "../appimages.ts";
import { operationErrorMessage } from "../errors.ts";
import { isProcessAborted } from "../utils/process.ts";

export interface InstalledAppImagesState {
  appImages: InstalledAppImage[];
  isLoading: boolean;
  error?: string;
  removeFromList(appImage: InstalledAppImage): void;
  refresh(): void;
}

export function useInstalledAppImages(
  supportPath: string,
): InstalledAppImagesState {
  const [appImages, setAppImages] = useState<InstalledAppImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(undefined);
    listInstalledAppImages({ supportPath }, controller.signal)
      .then(setAppImages)
      .catch((loadError: unknown) => {
        if (isProcessAborted(loadError)) return;
        console.error("Unable to list installed AppImages", loadError);
        setAppImages([]);
        setError(operationErrorMessage(
          loadError,
          "Installed AppImages could not be loaded",
        ));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [generation, supportPath]);

  return {
    appImages,
    isLoading,
    error,
    removeFromList: (appImage) => {
      const key = appImageKey(appImage);
      setAppImages((current) =>
        current.filter((candidate) => appImageKey(candidate) !== key)
      );
    },
    refresh: () => setGeneration((value) => value + 1),
  };
}
