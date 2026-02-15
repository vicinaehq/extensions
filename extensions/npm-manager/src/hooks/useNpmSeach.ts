import { useDebounce } from "@uidotdev/usehooks";
import { useState, useEffect } from "react";
import type { NPMProject } from "../types";

export const useNpmSeach = (query: string, project: NPMProject) => {
  const [npmPackages, setNpmPackages] = useState<NPMPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const debouncedSearchTerm = useDebounce(query, 300);

  useEffect(() => {
    const abortController = new AbortController();
    if (!debouncedSearchTerm) return setNpmPackages([]);

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
        installed: !!project.dependencies.some(
          (dep) => dep.name === obj.package.name,
        ),
      }));

      setNpmPackages(packages);
    };

    getPackages();

    return () => {
      abortController.abort();
    };
  }, [debouncedSearchTerm, project]);
  return { npmPackages, loading };
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
  installed?: boolean;
  hasUpdate?: boolean;
  dev?: boolean;
  license?: string;
  weeklyDownloads: number;
  publisher: {
    username: string;
    email: string;
  };
};
