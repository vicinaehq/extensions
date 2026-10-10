import { useEffect, useState } from "react";
import { type FlathubApp, fetchAppDetails } from "./flathub";

const APP_DETAIL_STALE_MS = 10 * 60 * 1000;

const appDetailCache = new Map<
	string,
	{ data: FlathubApp; fetchedAt: number }
>();

/**
 * Lightweight stand-in for `useQuery(["flathub","app-detail",appId], …)` that
 * fetches Flathub app details and caches them for a short while. No external
 * query library is required.
 */
export function useAppDetail(
	appId: string,
	enabled: boolean,
): { data: FlathubApp | null; isLoading: boolean } {
	const [state, setState] = useState<{
		data: FlathubApp | null;
		isLoading: boolean;
	}>({ data: null, isLoading: enabled });

	useEffect(() => {
		if (!enabled) return;
		const cached = appDetailCache.get(appId);
		if (cached && Date.now() - cached.fetchedAt < APP_DETAIL_STALE_MS) {
			setState({ data: cached.data, isLoading: false });
			return;
		}
		let cancelled = false;
		setState({ data: null, isLoading: true });
		fetchAppDetails(appId)
			.then((fullApp) => {
				if (cancelled) return;
				appDetailCache.set(appId, { data: fullApp, fetchedAt: Date.now() });
				setState({ data: fullApp, isLoading: false });
			})
			.catch(() => {
				if (!cancelled) setState({ data: null, isLoading: false });
			});
		return () => {
			cancelled = true;
		};
	}, [appId, enabled]);

	return state;
}
