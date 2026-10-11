import { useCallback, useEffect, useState } from "react";
import {
	Action,
	ActionPanel,
	Color,
	Icon,
	List,
	open,
	openExtensionPreferences,
	showToast,
	Toast,
} from "@vicinae/api";
import {
	type DaemonStatus,
	fff,
	logPath,
	type RootStatus,
	restartDaemon,
	stopDaemon,
} from "./lib/daemon";
import { tildify } from "./lib/preferences";

const REFRESH_MS = 1_000;

function rootState(root: RootStatus): { label: string; color: Color } {
	if (root.error) return { label: "Error", color: Color.Red };
	if (root.isScanning) return { label: "Scanning", color: Color.Orange };
	if (!root.isWarmupComplete)
		return { label: "Indexing contents", color: Color.Yellow };
	return { label: "Ready", color: Color.Green };
}

export default function ManageIndex() {
	const [status, setStatus] = useState<DaemonStatus | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [stopped, setStopped] = useState(false);

	const refresh = useCallback(async () => {
		try {
			setStatus(await fff.status());
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	useEffect(() => {
		if (stopped) return;
		refresh();
		const timer = setInterval(refresh, REFRESH_MS);
		return () => clearInterval(timer);
	}, [refresh, stopped]);

	const run = async (title: string, fn: () => Promise<unknown>) => {
		const toast = await showToast({ style: Toast.Style.Animated, title });
		try {
			await fn();
			toast.style = Toast.Style.Success;
			toast.title = `${title} done`;
		} catch (e) {
			toast.style = Toast.Style.Failure;
			toast.title = `${title} failed`;
			toast.message = e instanceof Error ? e.message : String(e);
		}
	};

	const actions = (
		<ActionPanel>
			<Action
				title="Rescan All Directories"
				icon={Icon.ArrowClockwise}
				onAction={() => run("Rescan", fff.rescan)}
			/>
			<Action
				title="Restart Background Index"
				icon={Icon.RotateClockwise}
				onAction={() =>
					run("Restart", async () => {
						await restartDaemon();
						setStopped(false);
						await refresh();
					})
				}
			/>
			<Action
				title="Stop Background Index"
				icon={Icon.Stop}
				style="destructive"
				onAction={() =>
					run("Stop", async () => {
						setStopped(true);
						await stopDaemon();
						setStatus(null);
					})
				}
			/>
			<Action
				title="Open Log File"
				icon={Icon.Text}
				onAction={() => open(logPath())}
			/>
			<Action
				title="Open Extension Preferences"
				icon={Icon.Cog}
				onAction={openExtensionPreferences}
			/>
		</ActionPanel>
	);

	return (
		<List isLoading={!status && !error && !stopped} actions={actions}>
			{stopped ? (
				<List.EmptyView
					icon={Icon.Stop}
					title="Background index stopped"
					description="It starts again the next time you search."
					actions={actions}
				/>
			) : error ? (
				<List.EmptyView
					icon={Icon.Warning}
					title="fff index unavailable"
					description={`${error}\nLog: ${tildify(logPath())}`}
					actions={actions}
				/>
			) : null}
			{status ? (
				<List.Section
					title="Indexed Directories"
					subtitle={`daemon pid ${status.pid}`}
				>
					{status.roots.map((root) => {
						const state = rootState(root);
						return (
							<List.Item
								key={root.root}
								title={tildify(root.root)}
								icon={Icon.Folder}
								subtitle={
									root.error ??
									`${(root.scannedFilesCount ?? 0).toLocaleString()} files`
								}
								accessories={[
									...(root.isWatcherReady
										? [{ tag: { value: "Watching", color: Color.Blue } }]
										: []),
									{ tag: { value: state.label, color: state.color } },
								]}
								actions={actions}
							/>
						);
					})}
					{status.error ? (
						<List.Item
							title="Some directories could not be indexed"
							subtitle={status.error}
							icon={Icon.Warning}
							actions={actions}
						/>
					) : null}
				</List.Section>
			) : null}
		</List>
	);
}
