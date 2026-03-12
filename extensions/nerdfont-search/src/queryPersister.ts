import type {
	PersistedClient,
	Persister,
} from "@tanstack/react-query-persist-client";
import { Cache } from "@vicinae/api";
import { QUERY_CACHE_KEY } from "./constants";

const cache = new Cache();

export const queryPersister: Persister = {
	persistClient: async (client: PersistedClient) => {
		cache.set(QUERY_CACHE_KEY, JSON.stringify(client));
	},
	restoreClient: async () => {
		const cached = cache.get(QUERY_CACHE_KEY);

		if (!cached) {
			return undefined;
		}

		try {
			return JSON.parse(cached) as PersistedClient;
		} catch {
			cache.remove(QUERY_CACHE_KEY);
			return undefined;
		}
	},
	removeClient: async () => {
		cache.remove(QUERY_CACHE_KEY);
	},
};
