import { useDebounce } from "@uidotdev/usehooks";
import { useState, useEffect } from "react";
import type { NPMProject } from "../types";

export const useNpmSeach = (query: string) => {
  const [data, setData] = useState<NPMPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const debouncedSearchTerm = useDebounce(query, 300);

  useEffect(() => {
    const abortController = new AbortController();
    if (!debouncedSearchTerm) return setData([]);

    const getPackages = async () => {
      setLoading(true);
      const url = new URL("https://registry.npmjs.com/-/v1/search");
      url.searchParams.set("text", encodeURIComponent(debouncedSearchTerm));
      url.searchParams.set("size", "20");

      const res = await fetch(url.toString(), {
        signal: abortController.signal,
      });
      setLoading(false);
      if (!res.ok) return;
      const data = (await res.json()) as NPMApiResponse;

      let packages: NPMPackage[] = (data.objects ?? []).map((obj) => ({
        name: obj.package.name,
        version: obj.package.version,
        description: obj.package.description ?? "",
        license: obj.package.license,
        weeklyDownloads: obj.downloads?.weekly,
        publisher: {
          username: obj.package.publisher?.username ?? "Unknown",
          email: obj.package.publisher?.email ?? "Unknown",
        },
      }));

      setData(packages);
    };

    getPackages();

    return () => {
      abortController.abort();
    };
  }, [debouncedSearchTerm]);
  return { data, loading };
};

type NPMApiResponse = {
  objects?: {
    package: {
      name: string;
      version: string;
      description?: string;
      license?: string;

      publisher?: {
        username: string;
        email: string;
      };
    };
    downloads: {
      weekly: number;
    };
  }[];
};

export type NPMPackage = {
  name: string;
  version: string;
  newVersion?: string;
  description: string;
  hasUpdate?: boolean;
  dev?: boolean;
  license?: string;
  weeklyDownloads: number;
  publisher: {
    username: string;
    email: string;
  };
};
