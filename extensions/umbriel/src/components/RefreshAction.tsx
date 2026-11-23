import { Action, Icon } from "@vicinae/api";

interface RefreshActionProps {
	onRefresh: () => void | Promise<void>;
	title?: string;
}

/**
 * One consistent refresh shortcut for every list that reflects live state.
 */
export function RefreshAction({
	onRefresh,
	title = "Refresh",
}: RefreshActionProps) {
	return (
		<Action
			title={title}
			icon={Icon.ArrowClockwise}
			shortcut={{ modifiers: ["cmd"], key: "r" }}
			onAction={onRefresh}
		/>
	);
}
