import { usePromise } from "@raycast/utils";
import { useRef } from "react";
import type { Package } from "../types";

export const useGetVersionUpdate = (npmPackage: Package[]) => {
  const abortable = useRef<AbortController | null>(null);
  const { data = [], isLoading } = usePromise(
    async () => {
      const responses = npmPackage.map(async (pkg) => {
        const res = await fetch(`https://registry.npmjs.org/${pkg.name}`, {
          signal: abortable.current?.signal,
        });
        const json = (await res.json()) as Response;
        const latestVersion = json["dist-tags"].latest;
        return {
          name: pkg.name,
          newVersion: latestVersion,
        } as const;
      });
      return Promise.all(responses);
    },
    [],
    {
      abortable,
    },
  );

  return { data, isLoading };
};

export type Response = {
  name: string;
  "dist-tags": {
    latest: string;
  };
};
