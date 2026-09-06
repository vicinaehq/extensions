import { Action, Icon, Keyboard } from "@vicinae/api";

export function RefreshAction({ onReload }: { onReload: () => void }) {
	return (
		<Action
			title="Refresh"
			icon={Icon.ArrowClockwise}
			shortcut={Keyboard.Shortcut.Common.Refresh}
			onAction={onReload}
		/>
	);
}
