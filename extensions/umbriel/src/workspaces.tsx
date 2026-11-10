import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { useCallback, useMemo } from "react";
import { RefreshAction } from "./components/RefreshAction";
import { UmbrielList } from "./components/UmbrielList";
import { performAction, performTask } from "./lib/feedback";
import {
	compareStrings,
	formatLayout,
	formatWorkspaceLabel,
	formatWorkspaceTarget,
	pluralize,
} from "./lib/format";
import { useUmbrielQuery } from "./lib/hooks";
import type { Output, Workspace } from "./lib/types";
import { runAction } from "./lib/umbriel";

const LAYOUTS = ["scrolling", "dwindle", "master", "stacking"] as const;

const SWAP_ACTIONS = [
	{ title: "Next", action: "workspace-swap-active-output-next" },
	{ title: "Previous", action: "workspace-swap-active-output-previous" },
	{ title: "Left", action: "workspace-swap-active-output-left" },
	{ title: "Right", action: "workspace-swap-active-output-right" },
	{ title: "Up", action: "workspace-swap-active-output-up" },
	{ title: "Down", action: "workspace-swap-active-output-down" },
];

export default function Workspaces() {
	const workspacesQuery = useUmbrielQuery<Workspace[]>("workspaces");
	const outputsQuery = useUmbrielQuery<Output[]>("outputs");

	const workspaces = useMemo(
		() => workspacesQuery.data ?? [],
		[workspacesQuery.data],
	);
	const outputs = useMemo(
		() =>
			[...(outputsQuery.data ?? [])].sort((a, b) =>
				compareStrings(a.name, b.name),
			),
		[outputsQuery.data],
	);
	const outputOrder = useMemo(
		() => new Map(outputs.map((output, index) => [output.name, index])),
		[outputs],
	);

	const refresh = useCallback(async () => {
		await Promise.all([workspacesQuery.refresh(), outputsQuery.refresh()]);
	}, [workspacesQuery.refresh, outputsQuery.refresh]);

	const switchTo = async (workspace: Workspace) => {
		await runAction("workspace-switch", ...formatWorkspaceTarget(workspace));
	};

	const performWorkspaceAction = async (
		workspace: Workspace,
		action: string,
		title: string,
		args: string[] = [],
	) => {
		await performTask({
			loading: title,
			success: title,
			refresh,
			task: async () => {
				if (!workspace.focused) await switchTo(workspace);
				await runAction(action, ...args);
			},
		});
	};

	const sections = useMemo(() => {
		const groups = new Map<string, Workspace[]>();
		for (const workspace of workspaces) {
			const list = groups.get(workspace.output) ?? [];
			list.push(workspace);
			groups.set(workspace.output, list);
		}

		return [...groups.entries()]
			.sort(
				([a], [b]) => (outputOrder.get(a) ?? 999) - (outputOrder.get(b) ?? 999),
			)
			.map(([output, items]) => ({
				output,
				workspaces: items.sort((a, b) => a.index - b.index),
			}));
	}, [workspaces, outputOrder]);

	const performDirect = (action: string, title: string, args: string[]) =>
		performAction(action, args, { success: title, refresh });

	return (
		<UmbrielList
			isLoading={workspacesQuery.loading}
			isEmpty={workspaces.length === 0}
			error={workspacesQuery.error}
			emptyTitle="No Workspaces Found"
			emptyDescription="Umbriel reported no workspaces."
			emptyIcon={Icon.Layers}
			searchBarPlaceholder="Search workspaces, outputs, and layouts…"
			onRefresh={refresh}
		>
			{sections.map((section) => (
				<List.Section
					key={section.output}
					title={section.output}
					subtitle={`${section.workspaces.length}`}
				>
					{section.workspaces.map((workspace) => {
						const label = formatWorkspaceLabel(workspace);
						const destinationOutputs = outputs.filter(
							(output) => output.name !== workspace.output && output.enabled,
						);

						return (
							<List.Item
								key={workspace.id}
								title={label}
								subtitle={formatLayout(workspace.layout)}
								accessories={[
									{
										tag: {
											value: pluralize(workspace.window_count, "window"),
										},
									},
								]}
								icon={Icon.AppWindowList}
								active={workspace.active}
								keywords={[
									workspace.name,
									workspace.id,
									workspace.output,
									workspace.layout,
									`${workspace.index}`,
								]}
								actions={
									<ActionPanel>
										<ActionPanel.Section title="Workspace">
											<Action
												title="Switch to Workspace"
												icon={Icon.EnterKey}
												shortcut={{ modifiers: ["cmd"], key: "return" }}
												onAction={() =>
													performTask({
														loading: `Switching to ${label}`,
														success: `Switched to ${label}`,
														refresh,
														task: () => switchTo(workspace),
													})
												}
											/>
											<ActionPanel.Submenu
												title="Layout"
												icon={Icon.AppWindowGrid2x2}
												shortcut={{ modifiers: ["cmd"], key: "i" }}
											>
												{LAYOUTS.map((layout) => (
													<Action
														key={layout}
														title={formatLayout(layout)}
														icon={Icon.AppWindowGrid2x2}
														onAction={() =>
															performWorkspaceAction(
																workspace,
																"workspace-set-layout",
																`Set ${label} to ${formatLayout(layout)}`,
																[layout],
															)
														}
													/>
												))}
												<Action
													title="Cycle All Layouts"
													icon={Icon.ArrowClockwise}
													onAction={() =>
														performWorkspaceAction(
															workspace,
															"workspace-set-layout",
															`Cycled ${label} layout`,
															["toggle"],
														)
													}
												/>
											</ActionPanel.Submenu>
										</ActionPanel.Section>
										<ActionPanel.Section title="Move & Swap">
											<Action
												title="Move Workspace Up"
												icon={Icon.ArrowUp}
												onAction={() =>
													performWorkspaceAction(
														workspace,
														"workspace-move-up",
														"Moved workspace up",
													)
												}
											/>
											<Action
												title="Move Workspace Down"
												icon={Icon.ArrowDown}
												onAction={() =>
													performWorkspaceAction(
														workspace,
														"workspace-move-down",
														"Moved workspace down",
													)
												}
											/>
											{destinationOutputs.length > 0 && (
												<ActionPanel.Submenu
													title="Move Workspace to Output"
													icon={Icon.Monitor}
												>
													{destinationOutputs.map((output) => (
														<Action
															key={output.name}
															title={output.name}
															icon={Icon.Monitor}
															onAction={() =>
																performTask({
																	loading: `Moving ${label} to ${output.name}`,
																	success: `Moved ${label} to ${output.name}`,
																	refresh,
																	task: async () => {
																		if (!workspace.focused)
																			await switchTo(workspace);
																		await runAction(
																			"workspace-move-to-output",
																			output.name,
																		);
																	},
																})
															}
														/>
													))}
												</ActionPanel.Submenu>
											)}
											<ActionPanel.Submenu
												title="Swap Active Workspace with Output"
												icon={Icon.Switch}
											>
												{SWAP_ACTIONS.map((item) => (
													<Action
														key={item.action}
														title={item.title}
														onAction={() =>
															performWorkspaceAction(
																workspace,
																item.action,
																`Swapped active workspace ${item.title.toLowerCase()}`,
															)
														}
													/>
												))}
											</ActionPanel.Submenu>
										</ActionPanel.Section>
										<ActionPanel.Section title="Move Focused">
											<Action
												title="Move Focused Column Here"
												icon={Icon.ArrowRightCircle}
												onAction={() =>
													performDirect(
														"column-move-to-workspace",
														`Moved focused column to ${label}`,
														formatWorkspaceTarget(workspace),
													)
												}
											/>
											<Action
												title="Move Focused Window Here"
												icon={Icon.ArrowRight}
												onAction={() =>
													performDirect(
														"window-move-to-workspace",
														`Moved focused window to ${label}`,
														formatWorkspaceTarget(workspace),
													)
												}
											/>
											<Action
												title="Move Focused Window Here Silently"
												icon={Icon.ArrowRight}
												onAction={() =>
													performDirect(
														"window-move-to-workspace-silent",
														`Moved focused window silently to ${label}`,
														formatWorkspaceTarget(workspace),
													)
												}
											/>
										</ActionPanel.Section>
										<RefreshAction onRefresh={refresh} />
									</ActionPanel>
								}
							/>
						);
					})}
				</List.Section>
			))}
		</UmbrielList>
	);
}
