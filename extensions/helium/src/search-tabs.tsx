import { Action, ActionPanel, Icon, List, closeMainWindow, showToast, Toast } from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import {
	activateTab,
	closeTab,
	ensureDebuggingFlag,
	isHeliumRunning,
	launchHelium,
	listTabs,
	quitHelium,
	type HeliumTab,
} from "./browser";
import { getFavicon } from "./utils";

export default function Command() {
	const [tabs, setTabs] = useState<HeliumTab[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		setIsLoading(true);
		try {
			setTabs(await listTabs());
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setTabs([]);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	if (error) {
		return (
			<List isLoading={false}>
				<List.EmptyView
					title="Cannot reach Helium's debugging endpoint"
					description={error}
					icon={Icon.Exclamationmark}
					actions={<DebugSetupActions onDone={refresh} />}
				/>
			</List>
		);
	}

	return (
		<List isLoading={isLoading} searchBarPlaceholder="Search open Helium tabs">
			{tabs.map((tab) => (
				<List.Item
					key={tab.id}
					icon={tab.faviconUrl ? { source: tab.faviconUrl, fallback: Icon.AppWindow } : getFavicon(tab.url, Icon.AppWindow)}
					title={tab.title || tab.url}
					subtitle={tab.url}
					keywords={[tab.url, tab.title]}
					actions={
						<ActionPanel>
							<Action
								title="Switch to Tab"
								icon={Icon.ArrowRight}
								onAction={async () => {
									await closeMainWindow();
									try {
										await activateTab(tab.id);
									} catch (e) {
										await showToast({
											style: Toast.Style.Failure,
											title: "Failed to switch tab",
											message: e instanceof Error ? e.message : String(e),
										});
									}
								}}
							/>
							<Action
								title="Close Tab"
								icon={Icon.XMarkCircle}
								style="destructive"
								onAction={async () => {
									try {
										await closeTab(tab.id);
										await refresh();
									} catch (e) {
										await showToast({
											style: Toast.Style.Failure,
											title: "Failed to close tab",
											message: e instanceof Error ? e.message : String(e),
										});
									}
								}}
							/>
							<Action.CopyToClipboard title="Copy URL" content={tab.url} />
							<Action title="Reload Tabs" icon={Icon.Repeat} onAction={refresh} />
						</ActionPanel>
					}
				/>
			))}
			<List.EmptyView
				title="No open tabs"
				description={isHeliumRunning() ? "Helium reports no open tabs." : "Helium is not running."}
				icon={Icon.AppWindow}
				actions={
					<ActionPanel>
						<Action title="Reload Tabs" icon={Icon.Repeat} onAction={refresh} />
					</ActionPanel>
				}
			/>
		</List>
	);
}

/**
 * One-click setup for users whose Helium started without a debugging port:
 * write the flag into Helium's launcher flags file and restart the browser.
 */
function DebugSetupActions({ onDone }: { onDone: () => Promise<void> }) {
	const enableAndRestart = async () => {
		try {
			const flagsPath = ensureDebuggingFlag();
			const restarted = await quitHelium();
			// --restore-last-session applies to this launch only, so the user's
			// configured startup behavior is left untouched.
			launchHelium(restarted ? ["--restore-last-session"] : []);
			await closeMainWindow();
			await showToast({
				style: Toast.Style.Success,
				title: "Debugging enabled",
				message: `Flag written to ${flagsPath}; Helium is restarting`,
			});
		} catch (e) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Failed to enable debugging",
				message: e instanceof Error ? e.message : String(e),
			});
		}
	};

	return (
		<ActionPanel>
			<Action title="Enable Debugging and Restart Helium" icon={Icon.Cog} onAction={enableAndRestart} />
			<Action title="Retry" icon={Icon.Repeat} onAction={onDone} />
		</ActionPanel>
	);
}
