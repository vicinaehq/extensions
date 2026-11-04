import {
	Action,
	ActionPanel,
	closeMainWindow,
	Color,
	Icon,
	Keyboard,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ACTIONS, SECTION_ORDER } from "./catalog";
import { expandAction, type NiriState } from "./expand";
import {
	queryOutputs,
	queryWindows,
	queryWorkspaces,
	runNiriAction,
} from "./niri";

const SECTION_ICONS: Record<string, Icon> = {
	Windows: Icon.AppWindow,
	Columns: Icon.AppWindowGrid2x2,
	Workspaces: Icon.StackedBars3,
	Monitors: Icon.Monitor,
	"Screenshots & Casting": Icon.Camera,
	"Layout & Overview": Icon.Overview,
	System: Icon.WrenchScrewdriver,
};

async function runAction(name: string, args: string[]) {
	const result = await runNiriAction(name, args);
	if (result.ok) {
		await closeMainWindow();
	} else {
		await showToast({
			style: Toast.Style.Failure,
			title: "Action failed",
			message: result.error,
		});
	}
}

export default function NiriActions() {
	const [state, setState] = useState<NiriState>({
		workspaces: [],
		outputs: [],
		windows: [],
	});
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | undefined>();
	const [reloadToken, setReloadToken] = useState(0);

	const handleReload = useCallback(() => setReloadToken((x) => x + 1), []);

	useEffect(() => {
		let cancelled = false;
		setIsLoading(true);
		setError(undefined);

		Promise.all([queryWorkspaces(), queryOutputs(), queryWindows()])
			.then(([workspaces, outputs, windows]) => {
				if (cancelled) return;
				setState({ workspaces, outputs, windows });
				setIsLoading(false);
			})
			.catch((e: unknown) => {
				if (cancelled) return;
				const message = e instanceof Error ? e.message : String(e);
				setState({ workspaces: [], outputs: [], windows: [] });
				setIsLoading(false);
				setError(message);
			});

		return () => {
			cancelled = true;
		};
	}, [reloadToken]);

	const sections = useMemo(() => {
		return SECTION_ORDER.map((section) => ({
			section,
			items: ACTIONS.filter((a) => a.section === section).flatMap((a) =>
				expandAction(a, state).map((item) => ({ action: a, item })),
			),
		})).filter((s) => s.items.length > 0);
	}, [state]);

	const reloadAction = useMemo(
		() => (
			<Action
				title="Reload"
				icon={Icon.RotateClockwise}
				shortcut={Keyboard.Shortcut.Common.Refresh}
				onAction={handleReload}
			/>
		),
		[handleReload],
	);

	const errorView = useMemo(
		() => (
			<List.EmptyView
				icon={Icon.Warning}
				title="Niri IPC unreachable"
				description={
					error ??
					"Could not query the running niri instance. Make sure niri is running and this command is used inside a niri session."
				}
				actions={<ActionPanel>{reloadAction}</ActionPanel>}
			/>
		),
		[error, reloadAction],
	);

	return (
		<List
			isLoading={isLoading}
			navigationTitle="Niri Actions"
			searchBarPlaceholder="Search niri actions..."
		>
			{!isLoading && error ? errorView : null}
			{!error &&
				sections.map(({ section, items }) => (
					<List.Section key={section} title={section}>
						{items.map(({ action, item }) => (
							<List.Item
								key={item.key}
								title={item.title}
								subtitle={item.subtitle}
								icon={SECTION_ICONS[section] ?? Icon.Terminal}
								keywords={item.keywords}
								accessories={[
									...(item.tag ? [{ tag: { value: item.tag, color: Color.Blue } }] : []),
									...(item.text ? [{ text: item.text }] : []),
								]}
								actions={
									<ActionPanel>
										<Action
											title="Run Action"
											icon={Icon.Play}
											shortcut={Keyboard.Shortcut.Common.Open}
											onAction={() => runAction(action.name, item.args)}
										/>
										<Action.CopyToClipboard
											title="Copy Command"
											shortcut={Keyboard.Shortcut.Common.Copy}
											content={`niri msg action ${action.name} ${item.args.join(" ")}`.trim()}
										/>
										{reloadAction}
									</ActionPanel>
								}
							/>
						))}
					</List.Section>
				))}
		</List>
	);
}
