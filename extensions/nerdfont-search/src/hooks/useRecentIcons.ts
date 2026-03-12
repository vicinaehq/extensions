import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RECENT_ICONS_LIMIT } from "../constants";

const RECENT_ICONS_QUERY_KEY = ["recentIcons"] as const;

type RecentIcon = {
	id: string;
	char: string;
	code: string;
	hexCode: string;
	htmlEntity: string;
	displayName: string;
	nerdFontId: string;
	packLabel: string;
	iconPath: string;
};

export function useRecentIcons() {
	const queryClient = useQueryClient();

	const { data: recentIcons = [] } = useQuery({
		queryKey: RECENT_ICONS_QUERY_KEY,
		queryFn: async () => [],
		initialData: [],
	});

	const addRecentMutation = useMutation({
		mutationFn: async (icon: RecentIcon) => {
			const updated = [
				icon,
				...recentIcons.filter((r) => r.id !== icon.id),
			].slice(0, RECENT_ICONS_LIMIT);

			return updated;
		},
		onSuccess: (updated) => {
			queryClient.setQueryData(RECENT_ICONS_QUERY_KEY, updated);
		},
	});

	const clearRecentMutation = useMutation({
		mutationFn: async () => [],
		onSuccess: () => {
			queryClient.setQueryData(RECENT_ICONS_QUERY_KEY, []);
		},
	});

	return {
		recentIcons,
		addRecent: (icon: RecentIcon) => addRecentMutation.mutate(icon),
		clearRecent: () => clearRecentMutation.mutate(),
	};
}

export type { RecentIcon };
