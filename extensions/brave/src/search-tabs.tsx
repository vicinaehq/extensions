import { Action, ActionPanel, Icon, List, closeMainWindow, showToast, Toast } from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import {
	activateTab,
	closeTab,
	ensureDebuggingFlag,
	launchBrave,
	listTabs,
	quitBrave,
	type BraveTab,
} from "./browser";
import { detectVariant, getFavicon, isBraveRunning, variantName } from "./utils";

export default function Command() {
	const [tabs, setTabs] = useState<BraveTab[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const variant = detectVariant();

	const refresh = useCallback(async () => {
		setIsLoading(true);
		try {
			if (!variant) {
				setError("No Brave or Brave Origin installation detected");
				setTabs([]);
				return;
			}
			setTabs(await listTabs(variant));
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setTabs([]);
		} finally {
			setIsLoading(false);
		}
	}, [variant]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	if (error) {
		return (
			<List isLoading={false}>
				<List.EmptyView
					title={`Cannot reach ${variant ? variantName(variant) : "Brave"}'s debugging endpoint`}
					description={error}
					icon={Icon.Exclamationmark}
					actions={variant ? <DebugSetupActions variant={variant} onDone={refresh} /> : undefined}
				/>
			</List>
		);
	}

	return (
		<List isLoading={isLoading} searchBarPlaceholder={`Search open ${variant ? variantName(variant) : "Brave"} tabs`}>
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
										if (variant) await activateTab(variant, tab.id);
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
										if (variant) await closeTab(variant, tab.id);
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
				description={
					variant && isBraveRunning(variant)
						? `${variantName(variant)} reports no open tabs.`
						: `${variant ? variantName(variant) : "Brave"} is not running.`
				}
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

function DebugSetupActions({ variant, onDone }: { variant: NonNullable<ReturnType<typeof detectVariant>>; onDone: () => Promise<void> }) {
	const name = variantName(variant);
	const enableAndRestart = async () => {
		try {
			const flagsPath = ensureDebuggingFlag(variant);
			const restarted = await quitBrave(variant);
			launchBrave(variant, restarted ? ["--restore-last-session"] : []);
			await closeMainWindow();
			await showToast({
				style: Toast.Style.Success,
				title: "Debugging enabled",
				message: `Flag written to ${flagsPath}; ${name} is restarting`,
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
			<Action title={`Enable Debugging and Restart ${name}`} icon={Icon.Cog} onAction={enableAndRestart} />
			<Action title="Retry" icon={Icon.Repeat} onAction={onDone} />
		</ActionPanel>
	);
}