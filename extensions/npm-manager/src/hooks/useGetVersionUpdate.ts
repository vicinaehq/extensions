import { useState, useEffect } from "react";
import { fetchPackageMetadata } from "../api/fetchPackageMetadata";
import type { Dependency } from "../types";

export const useGetVersionUpdate = (npmPackage: Dependency) => {
  const [loading, setLoading] = useState(false);
  const [versionData, setVersionData] = useState<{
    name: string;
    version: string;
    hasUpdate: boolean;
    newVersion: string;
  } | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    setLoading(true);
    const fetchAllMetadata = async () => {
      const metaData = await fetchPackageMetadata(
        npmPackage.name,
        npmPackage.version,
        abortController.signal,
      );

      setVersionData(metaData);
      setLoading(false);
    };

    fetchAllMetadata();

    return () => {
      abortController.abort();
    };
  }, [npmPackage]);
  return { hasUpdate: !!versionData?.hasUpdate, loading, versionData };
};
