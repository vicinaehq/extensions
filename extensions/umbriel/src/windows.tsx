import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { Fragment, useCallback, useMemo, useState } from "react";
import { RefreshAction } from "./components/RefreshAction";
import { UmbrielList } from "./components/UmbrielList";
import { confirmDestructive, performAction, performTask } from "./lib/feedback";
import { compareStrings, formatWorkspaceLabel, pluralize } from "./lib/format";
import { useUmbrielQuery } from "./lib/hooks";
import type { Output, Window, Workspace } from "./lib/types";
import { runAction } from "./lib/umbriel";

function windowDetail(window: Window, workspace: Workspace | undefined) {
	return (
		<List.Item.Detail
			metadata={
				<List.Item.Detail.Metadata>
					<List.Item.Detail.Metadata.Label
						title="Title"
						text={window.title || "Untitled Window"}
					/>
					<List.Item.Detail.Metadata.Label
						title="App ID"
						text={window.app_id || "—"}
					/>
					<List.Item.Detail.Metadata.Label title="Window ID" text={window.id} />
					<List.Item.Detail.Metadata.Label title="PID" text={`${window.pid}`} />
					<List.Item.Detail.Metadata.Separator />
					<List.Item.Detail.Metadata.Label
						title="Output"
						text={window.output}
					/>
					<List.Item.Detail.Metadata.Label
						title="Workspace"
						text={
							workspace ? formatWorkspaceLabel(workspace) : window.workspace
						}
					/>
				</List.Item.Detail.Metadata>
			}
		/>
	);
}

export default function Windows() {
	const windowsQuery = useUmbrielQuery<Window[]>("windows");
	const workspacesQuery = useUmbrielQuery<Workspace[]>("workspaces");
	const outputsQuery = useUmbrielQuery<Output[]>("outputs");
	const focusedQuery = useUmbrielQuery<Window>("focused-window");
	const [showDetail, setShowDetail] = useState(false);

	const windows = useMemo(
		() =>
			(windowsQuery.data ?? [])
				.filter((window) => !window.scratchpad)
				.sort(
					(a, b) =>
						compareStrings(a.app_id, b.app_id) || compareStrings(a.id, b.id),
				),
		[windowsQuery.data],
	);
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
	const focusedId = focusedQuery.error ? null : (focusedQuery.data?.id ?? null);

	const workspaceById = useMemo(
		() => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
		[workspaces],
	);

	const refreshAll = useCallback(async () => {
		await Promise.all([
			windowsQuery.refresh(),
			workspacesQuery.refresh(),
			outputsQuery.refresh(),
			focusedQuery.refresh(),
		]);
	}, [
		windowsQuery.refresh,
		workspacesQuery.refresh,
		outputsQuery.refresh,
		focusedQuery.refresh,
	]);

	const performSimpleAction = (action: string, args: string[], title: string) =>
		performAction(action, args, { success: title, refresh: refreshAll });

	const closeWindow = async (window: Window) => {
		await performTask({
			loading: `Closing ${window.title || window.app_id}`,
			success: "Window closed",
			refresh: refreshAll,
			task: () => runAction("window-close", window.id),
		});
	};

	const killWindow = async (window: Window) => {
		const confirmed = await confirmDestructive(
			"Kill this window?",
			`This sends SIGKILL to the process owning ${window.title || window.app_id}. All of its windows will close and unsaved work may be lost.`,
			"Kill Process",
		);
		if (!confirmed) return;
		await performTask({
			loading: "Killing process…",
			success: "Process killed",
			refresh: refreshAll,
			task: () => runAction("window-kill", window.id),
		});
	};

	const sections = useMemo(() => {
		const outputOrder = new Map(
			outputs.map((output, index) => [output.name, index]),
		);
		const groups = new Map<
			string,
			{
				key: string;
				output: string;
				order: number;
				workspaces: {
					key: string;
					workspace: Workspace | undefined;
					windows: Window[];
				}[];
			}
		>();

		for (const window of windows) {
			const workspace = workspaceById.get(window.workspace);
			const output = workspace?.output ?? window.output ?? "Unknown Output";
			let group = groups.get(output);
			if (!group) {
				group = {
					key: output,
					output,
					order: outputOrder.get(output) ?? 10000,
					workspaces: [],
				};
				groups.set(output, group);
			}

			let workspaceGroup = group.workspaces.find(
				(candidate) => candidate.key === window.workspace,
			);
			if (!workspaceGroup) {
				workspaceGroup = {
					key: window.workspace,
					workspace,
					windows: [],
				};
				group.workspaces.push(workspaceGroup);
			}
			workspaceGroup.windows.push(window);
		}

		for (const group of groups.values()) {
			group.workspaces.sort(
				(a, b) => (a.workspace?.index ?? 999) - (b.workspace?.index ?? 999),
			);
		}

		return [...groups.values()].sort((a, b) => a.order - b.order);
	}, [windows, workspaceById, outputs]);

	const renderWindowItem = (window: Window) => {
		const workspace = workspaceById.get(window.workspace);
		const title = window.title || window.app_id || "Untitled Window";

		return (
			<List.Item
				key={window.id}
				title={title}
				subtitle={window.app_id}
				icon={Icon.AppWindow}
				active={focusedId === window.id}
				keywords={[
					window.title,
					window.app_id,
					window.id,
					window.workspace,
					window.output,
					window.pid.toString(),
				].filter(Boolean)}
				detail={showDetail ? windowDetail(window, workspace) : undefined}
				actions={
					<ActionPanel>
						<Action
							title="Focus Window"
							icon={Icon.Eye}
							shortcut={{ modifiers: ["cmd"], key: "return" }}
							onAction={() =>
								performSimpleAction(
									"window-focus",
									[window.id],
									`Focused ${title}`,
								)
							}
						/>
						<Action
							title="Focus and Warp Cursor"
							icon={Icon.Mouse}
							onAction={() =>
								performSimpleAction(
									"window-focus-warp",
									[window.id],
									`Focused and warped to ${title}`,
								)
							}
						/>
						<Action
							title="Close Window"
							icon={Icon.XMarkCircle}
							style={Action.Style.Destructive}
							shortcut={{ modifiers: ["cmd"], key: "w" }}
							onAction={() => closeWindow(window)}
						/>
						<Action
							title="Kill Process"
							icon={Icon.Exclamationmark}
							style={Action.Style.Destructive}
							shortcut={{ modifiers: ["cmd"], key: "x" }}
							onAction={() => killWindow(window)}
						/>
						<Action
							title={showDetail ? "Hide Details" : "Show Details"}
							icon={Icon.Text}
							shortcut={{ modifiers: ["cmd"], key: "i" }}
							onAction={() => setShowDetail((shown) => !shown)}
						/>
						<ActionPanel.Section title="Copy Information">
							<Action.CopyToClipboard
								title="Copy Title"
								icon={Icon.Text}
								content={window.title}
							/>
							<Action.CopyToClipboard
								title="Copy App ID"
								icon={Icon.AppWindow}
								content={window.app_id}
							/>
							<Action.CopyToClipboard
								title="Copy Window ID"
								icon={Icon.CopyClipboard}
								content={window.id}
							/>
						</ActionPanel.Section>
						<RefreshAction onRefresh={refreshAll} />
					</ActionPanel>
				}
			/>
		);
	};

	return (
		<UmbrielList
			isLoading={windowsQuery.loading}
			isEmpty={windows.length === 0}
			error={windowsQuery.error}
			emptyTitle="No Windows Found"
			emptyDescription="Umbriel reported no open windows."
			emptyIcon={Icon.AppWindow}
			searchBarPlaceholder="Search windows, apps, and outputs…"
			isShowingDetail={showDetail && windows.length > 0}
			onRefresh={refreshAll}
		>
			{sections.map((section) => (
				<Fragment key={section.key}>
					{section.workspaces.map((workspaceGroup) => {
						const workspace = workspaceGroup.workspace;
						const label = workspace
							? formatWorkspaceLabel(workspace)
							: workspaceGroup.key;

						return (
							<List.Section
								key={workspaceGroup.key}
								title={`${section.output} - ${label}`}
								subtitle={pluralize(workspaceGroup.windows.length, "window")}
							>
								{workspaceGroup.windows.map(renderWindowItem)}
							</List.Section>
						);
					})}
				</Fragment>
			))}
		</UmbrielList>
	);
}
