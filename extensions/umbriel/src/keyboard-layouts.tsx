import { Action, ActionPanel, Color, Icon, List } from "@vicinae/api";
import { useCallback } from "react";
import { RefreshAction } from "./components/RefreshAction";
import { UmbrielList } from "./components/UmbrielList";
import { performAction } from "./lib/feedback";
import { useUmbrielQuery } from "./lib/hooks";
import type { KeyboardLayouts } from "./lib/types";

export default function KeyboardLayoutsCommand() {
	const layoutsQuery = useUmbrielQuery<KeyboardLayouts>("keyboard-layouts");

	const layouts = layoutsQuery.data?.names ?? [];
	const currentIndex = layoutsQuery.data?.current_index ?? -1;

	const refresh = useCallback(async () => {
		await layoutsQuery.refresh();
	}, [layoutsQuery.refresh]);

	const nextLayout = () =>
		performAction("keyboard-layout-next", [], {
			success: "Switched to the next keyboard layout",
			refresh,
		});

	return (
		<UmbrielList
			isLoading={layoutsQuery.loading}
			isEmpty={layouts.length === 0}
			error={layoutsQuery.error}
			emptyTitle="No Keyboard Layouts Found"
			emptyDescription="Umbriel reported no configured keyboard layouts."
			emptyIcon={Icon.Keyboard}
			searchBarPlaceholder="Search keyboard layouts…"
			onRefresh={refresh}
		>
			<List.Section title="Layouts" subtitle={`${layouts.length}`}>
				{layouts.map((name, index) => {
					const active = index === currentIndex;
					return (
						<List.Item
							key={`${name}:${index}`}
							title={name}
							subtitle={active ? "Active layout" : "Configured layout"}
							icon={Icon.Keyboard}
							active={active}
							accessories={
								active
									? [
											{
												tag: { value: "Active", color: Color.Green },
												icon: Icon.CheckCircle,
											},
										]
									: []
							}
							actions={
								<ActionPanel>
									<Action
										title="Cycle Keyboard Layout"
										icon={Icon.ArrowClockwise}
										shortcut={{ modifiers: ["cmd"], key: "return" }}
										onAction={nextLayout}
									/>
									<Action.CopyToClipboard
										title="Copy Layout Name"
										content={name}
										shortcut={{ modifiers: ["cmd"], key: "c" }}
									/>
									<Action.CopyToClipboard
										title="Copy Layout Index"
										content={`${index + 1}`}
									/>
									<RefreshAction onRefresh={refresh} />
								</ActionPanel>
							}
						/>
					);
				})}
			</List.Section>
		</UmbrielList>
	);
}
