import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { useCallback } from "react";
import { RefreshAction } from "./components/RefreshAction";
import { UmbrielList } from "./components/UmbrielList";
import { performAction } from "./lib/feedback";
import { compareStrings, formatWorkspaceLabel, pluralize } from "./lib/format";
import { useUmbrielQuery } from "./lib/hooks";
import type { Output, Window, Workspace } from "./lib/types";

export default function Screencast() {
	const windowsQuery = useUmbrielQuery<Window[]>("windows");
	const outputsQuery = useUmbrielQuery<Output[]>("outputs");
	const workspacesQuery = useUmbrielQuery<Workspace[]>("workspaces");
	const windows = [...(windowsQuery.data ?? [])].sort(
		(a, b) =>
			compareStrings(a.output, b.output) ||
			compareStrings(a.workspace, b.workspace) ||
			compareStrings(a.app_id, b.app_id) ||
			compareStrings(a.id, b.id),
	);
	const outputs = [...(outputsQuery.data ?? [])].sort((a, b) =>
		compareStrings(a.name, b.name),
	);
	const workspaces = workspacesQuery.data ?? [];
	const workspaceById = new Map(
		workspaces.map((workspace) => [workspace.id, workspace]),
	);
	const outputOrder = new Map(
		outputs.map((output, index) => [output.name, index]),
	);
	const shareableWindows = windows.filter((window) => !window.scratchpad);

	const windowGroups = new Map<
		string,
		{ key: string; title: string; order: number; windows: Window[] }
	>();
	for (const window of shareableWindows) {
		const workspace = workspaceById.get(window.workspace);
		const output = workspace?.output ?? window.output ?? "Unknown Output";
		const key = `${output}:${window.workspace}`;
		const title = `${output} - ${
			workspace ? formatWorkspaceLabel(workspace) : window.workspace
		}`;
		const order =
			(outputOrder.get(output) ?? 9999) * 1000 + (workspace?.index ?? 999);
		let group = windowGroups.get(key);
		if (!group) {
			group = { key, title, order, windows: [] };
			windowGroups.set(key, group);
		}
		group.windows.push(window);
	}
	const windowSections = [...windowGroups.values()].sort(
		(a, b) => a.order - b.order,
	);

	const unavailable = Boolean(
		windowsQuery.error && outputsQuery.error && workspacesQuery.error,
	);

	const refresh = useCallback(async () => {
		await Promise.all([
			windowsQuery.refresh(),
			outputsQuery.refresh(),
			workspacesQuery.refresh(),
		]);
	}, [windowsQuery.refresh, outputsQuery.refresh, workspacesQuery.refresh]);

	const perform = (action: string, args: string[], title: string) =>
		performAction(action, args, {
			success: title,
			refresh,
		});

	const renderShareWindow = (window: Window) => (
		<List.Item
			key={window.id}
			title={window.title || window.app_id}
			subtitle={window.app_id}
			icon={Icon.AppWindow}
			active={window.focused}
			keywords={[
				window.title,
				window.app_id,
				window.id,
				window.output,
				window.workspace,
			]}
			actions={
				<ActionPanel>
					<Action
						title="Share This Window"
						icon={Icon.Video}
						onAction={() =>
							perform(
								"screencast-set-window",
								[window.id],
								"Screencast target set to window",
							)
						}
					/>
					<Action.CopyToClipboard title="Copy Window ID" content={window.id} />
					<Action.CopyToClipboard title="Copy Title" content={window.title} />
					<Action.CopyToClipboard title="Copy App ID" content={window.app_id} />
					<RefreshAction onRefresh={refresh} />
				</ActionPanel>
			}
		/>
	);

	return (
		<UmbrielList
			isLoading={
				windowsQuery.loading || outputsQuery.loading || workspacesQuery.loading
			}
			isEmpty={unavailable}
			error={unavailable ? (windowsQuery.error ?? outputsQuery.error) : null}
			emptyTitle="No Screencast Targets"
			emptyDescription="Umbriel reported no windows or outputs."
			emptyIcon={Icon.Video}
			searchBarPlaceholder="Search windows and outputs to share…"
			onRefresh={refresh}
		>
			<List.Section title="Controls">
				<List.Item
					title="Follow Focused Window"
					subtitle="Keep sharing whatever window receives focus"
					icon={Icon.Eye}
					actions={
						<ActionPanel>
							<Action
								title="Follow Focused Window"
								icon={Icon.Eye}
								shortcut={{ modifiers: ["cmd"], key: "return" }}
								onAction={() =>
									perform(
										"screencast-follow-window",
										[],
										"Screencast now follows the focused window",
									)
								}
							/>
							<RefreshAction onRefresh={refresh} />
						</ActionPanel>
					}
				/>
				<List.Item
					title="Follow Focused Output"
					subtitle="Keep sharing whatever output receives focus"
					icon={Icon.Monitor}
					actions={
						<ActionPanel>
							<Action
								title="Follow Focused Output"
								icon={Icon.Monitor}
								onAction={() =>
									perform(
										"screencast-follow-output",
										[],
										"Screencast now follows the focused output",
									)
								}
							/>
							<RefreshAction onRefresh={refresh} />
						</ActionPanel>
					}
				/>
				<List.Item
					title="Stop Following"
					subtitle="Keep the current target but stop following focus"
					icon={Icon.XMarkCircle}
					actions={
						<ActionPanel>
							<Action
								title="Stop Following"
								icon={Icon.XMarkCircle}
								onAction={() =>
									perform(
										"screencast-follow-stop",
										[],
										"Stopped following focus",
									)
								}
							/>
							<RefreshAction onRefresh={refresh} />
						</ActionPanel>
					}
				/>
				<List.Item
					title="Clear Screencast"
					subtitle="Pause the stream and stop following"
					icon={Icon.EyeDisabled}
					actions={
						<ActionPanel>
							<Action
								title="Clear Screencast"
								icon={Icon.EyeDisabled}
								onAction={() =>
									perform(
										"screencast-clear",
										[],
										"Cleared the screencast target",
									)
								}
							/>
							<RefreshAction onRefresh={refresh} />
						</ActionPanel>
					}
				/>
			</List.Section>

			<List.Section title="Share an Output" subtitle={`${outputs.length}`}>
				{outputs.length === 0 ? (
					<List.Item
						title="No Outputs Found"
						subtitle="Connect an output to share it."
						icon={Icon.Monitor}
						actions={
							<ActionPanel>
								<RefreshAction onRefresh={refresh} />
							</ActionPanel>
						}
					/>
				) : (
					outputs.map((output) => (
						<List.Item
							key={output.name}
							title={output.name}
							subtitle={[output.make, output.description]
								.filter(Boolean)
								.join(" · ")}
							icon={Icon.Monitor}
							keywords={[
								output.name,
								output.make,
								output.model,
								output.description,
							]}
							actions={
								<ActionPanel>
									<Action
										title="Share This Output"
										icon={Icon.Video}
										onAction={() =>
											perform(
												"screencast-set-output",
												[output.name],
												"Screencast target set to output",
											)
										}
									/>
									<Action.CopyToClipboard
										title="Copy Output Name"
										content={output.name}
									/>
									<RefreshAction onRefresh={refresh} />
								</ActionPanel>
							}
						/>
					))
				)}
			</List.Section>

			{windowSections.length === 0 ? (
				<List.Section title="Share a Window">
					<List.Item
						title="No Windows Found"
						subtitle="Open a window to share it."
						icon={Icon.AppWindow}
						actions={
							<ActionPanel>
								<RefreshAction onRefresh={refresh} />
							</ActionPanel>
						}
					/>
				</List.Section>
			) : (
				windowSections.map((section) => (
					<List.Section
						key={section.key}
						title={`Share Windows from ${section.title}`}
						subtitle={pluralize(section.windows.length, "window")}
					>
						{section.windows.map(renderShareWindow)}
					</List.Section>
				))
			)}
		</UmbrielList>
	);
}
