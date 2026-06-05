import { useFetch } from "@raycast/utils";
import { useDebounce } from "@uidotdev/usehooks";

export const useNpmSeach = (query: string) => {
  const debouncedSearchTerm = useDebounce(query, 300);
  const { data = [], isLoading } = useFetch(
    `https://registry.npmjs.com/-/v1/search?text=${debouncedSearchTerm}&size=20`,
    {
      keepPreviousData: true,
      execute: debouncedSearchTerm.length > 0,
      parseResponse: async (response) => {
        const data = (await response.json()) as NPMApiResponse;
        return (data?.objects ?? []).map((obj) => ({
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
      },
    },
  );

  return { data, isLoading };
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
