import { QueryCache, QueryClient } from "@tanstack/react-query";
import { showToast, Toast } from "@vicinae/api";
import { PERSIST_MAX_AGE, QUERY_STALE_TIME } from "./constants";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      showToast({
        style: Toast.Style.Failure,
        title: "Request failed",
        message: error instanceof Error ? error.message : undefined,
      });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME,
      gcTime: PERSIST_MAX_AGE,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
