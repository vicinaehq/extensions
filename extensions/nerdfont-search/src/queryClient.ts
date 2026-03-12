import { QueryClient } from "@tanstack/react-query";
import { QUERY_MAX_AGE } from "./constants";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: QUERY_MAX_AGE,
			gcTime: QUERY_MAX_AGE,
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
			retry: 1,
		},
		mutations: {
			retry: 0,
		},
	},
});
