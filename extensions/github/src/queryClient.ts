import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { Cache } from "@vicinae/api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: Infinity,
      networkMode: "always",
      refetchIntervalInBackground: true,
    },
  },
});

const cache = new Cache({
  namespace: "github-repos",
});

export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => cache.get(key) || null,
    setItem: (key, value) => cache.set(key, value),
    removeItem: (key) => cache.remove(key) as unknown as Promise<void>,
  },
});
