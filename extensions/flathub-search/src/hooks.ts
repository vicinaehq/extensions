import { keepPreviousData, useQuery } from "@tanstack/react-query";
import ms from "ms";
import {
	type FlathubApp,
	fetchAppDetails,
	fetchPopularApps,
	searchFlathub,
} from "./api";

export function usePopularApps() {
	return useQuery({
		queryKey: ["flathub", "popular"],
		queryFn: fetchPopularApps,
		staleTime: ms("10m"),
	});
}

export function useFlathubSearch(query: string) {
	return useQuery({
		queryKey: ["flathub", "search", query],
		queryFn: () => searchFlathub(query),
		enabled: query.trim().length > 0,
		placeholderData: keepPreviousData,
	});
}

export function useAppDetails(app: FlathubApp, enabled: boolean) {
	return useQuery({
		queryKey: ["flathub", "app-detail", app.app_id],
		queryFn: () => fetchAppDetails(app.app_id),
		staleTime: ms("10m"),
		enabled,
	});
}
