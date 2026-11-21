import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Action,
	ActionPanel,
	closeMainWindow,
	Color,
	Detail,
	Icon,
	Keyboard,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import {
	fetchServerInfo,
	findConfigPath,
	getMoonlightBinary,
	getServerInfoTimeout,
	endSession,
	findLocalStream,
	getPreferences,
	listApps,
	loadCachedApps,
	quitApp,
	readHosts,
	resolveBoxArt,
	resolveMoonlightBinary,
	saveCachedApps,
	startStream,
	streamArgs,
} from "./lib/moonlight";
import {
	formatCommand,
	type MoonlightApp,
	type MoonlightHost,
} from "./lib/parse";
import {
	type AppPresentation,
	decideAppPresentation,
	type HostSession,
	hostStatusSummary,
	type LocalStream,
	resolveHostSession,
	type ServerInfo,
	visibleApps,
} from "./lib/session";

interface HostState {
	apps: MoonlightApp[];
	/** True while a background refresh is running. */
	refreshing: boolean;
	error?: string;
	/** Host state from serverinfo; undefined while unknown. */
	serverInfo?: ServerInfo;
	/** Local `moonlight stream` process for the host, if any. */
	localStream?: LocalStream;
	statusLoading: boolean;
}

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

function initialState(host: MoonlightHost): HostState {
	const cached = loadCachedApps(host);
	// Fall back to the apps the Moonlight GUI last saw for this host.
	const apps = cached ? cached.apps : host.apps;
	return {
		apps,
		refreshing: true,
		localStream: findLocalStream(host),
		statusLoading: true,
	};
}

function sectionSubtitle(
	host: MoonlightHost,
	state: HostState,
	session: HostSession,
): string {
	const address = host.localAddress ?? host.manualAddress ?? host.remoteAddress;
	const parts =
		address && address.toLowerCase() !== host.name.toLowerCase()
			? [address]
			: [];
	const status = hostStatusSummary(session);
	if (status) parts.push(status);
	if (state.refreshing) parts.push("refreshing…");
	else if (state.error)
		parts.push(
			state.apps.length > 0 ? "offline, showing cached apps" : "offline",
		);
	return parts.join(" · ");
}

function HostActions({
	host,
	session,
	onRefresh,
	onRetryStatus,
}: {
	host: MoonlightHost;
	session?: HostSession;
	onRefresh: () => void;
	onRetryStatus: () => void;
}) {
	const handleQuit = useCallback(async () => {
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: `Quitting running app on ${host.name}…`,
		});
		try {
			await quitApp(host.name);
			toast.style = Toast.Style.Success;
			toast.title = `Quit running app on ${host.name}`;
		} catch (error) {
			toast.style = Toast.Style.Failure;
			toast.title = `Failed to quit app on ${host.name}`;
			toast.message = errorMessage(error);
		}
		onRefresh();
	}, [host.name, onRefresh]);

	const handleEndSession = useCallback(async () => {
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: `Ending session on ${host.name}…`,
		});
		try {
			const result = await endSession(host);
			if (result.quitError) {
				toast.style = Toast.Style.Failure;
				if (result.stillRunning.length > 0) {
					toast.title = `Failed to end session on ${host.name}`;
					toast.message = `Moonlight process ${result.stillRunning.join(", ")} did not exit after SIGTERM, and quitting the host app failed: ${result.quitError}`;
				} else if (result.terminated.length > 0) {
					toast.title = `Local stream ended, but quitting the app on ${host.name} failed`;
					toast.message = result.quitError;
				} else {
					toast.title = `Failed to quit app on ${host.name}`;
					toast.message = result.quitError;
				}
			} else if (result.stillRunning.length > 0) {
				toast.style = Toast.Style.Failure;
				toast.title = "Host app quit, but the local stream is still running";
				toast.message = `Moonlight process ${result.stillRunning.join(", ")} did not exit after SIGTERM`;
			} else {
				toast.style = Toast.Style.Success;
				toast.title = `Ended session on ${host.name}`;
			}
		} catch (error) {
			toast.style = Toast.Style.Failure;
			toast.title = `Failed to end session on ${host.name}`;
			toast.message = errorMessage(error);
		}
		onRefresh();
	}, [host, onRefresh]);

	return (
		<>
			{session?.busy && (
				<Action
					title="End Session"
					icon={Icon.Stop}
					style={Action.Style.Destructive}
					shortcut={Keyboard.Shortcut.Common.Remove}
					onAction={handleEndSession}
				/>
			)}
			<Action
				title="Quit Running App on Host"
				icon={Icon.XMarkCircle}
				style={Action.Style.Destructive}
				shortcut={{ modifiers: ["ctrl"], key: "q" }}
				onAction={handleQuit}
			/>
			<Action
				title="Refresh"
				icon={Icon.ArrowClockwise}
				shortcut={Keyboard.Shortcut.Common.Refresh}
				onAction={onRefresh}
			/>
			{session?.status === "unknown" && (
				<Action
					title="Retry Host Status"
					icon={Icon.Signal3}
					onAction={onRetryStatus}
				/>
			)}
		</>
	);
}

function appAccessories(app: MoonlightApp, presentation: AppPresentation) {
	const accessories: List.Item.Accessory[] = [];
	if (presentation.marker === "streaming-here") {
		accessories.push({
			icon: { source: Icon.PlayFilled, tintColor: Color.Green },
			tooltip: "Streaming on this PC",
		});
	} else if (presentation.marker === "running-on-host") {
		accessories.push({
			icon: { source: Icon.CircleFilled, tintColor: Color.Orange },
			tooltip: "Running on host — Resume",
		});
	} else if (presentation.marker === "status-loading") {
		accessories.push({
			icon: { source: Icon.CircleProgress, tintColor: Color.SecondaryText },
			tooltip: "Checking host status…",
		});
	} else if (presentation.marker === "status-unknown") {
		accessories.push({
			icon: { source: Icon.QuestionMarkCircle, tintColor: Color.SecondaryText },
			tooltip: "Host status unknown — couldn't check whether the host is busy",
		});
	}
	if (app.hdr) {
		accessories.push({ text: { value: "HDR", color: Color.SecondaryText } });
	}
	if (app.hidden) {
		accessories.push({
			icon: { source: Icon.EyeDisabled, tintColor: Color.SecondaryText },
			tooltip: "Hidden in Moonlight",
		});
	}
	return accessories;
}

function AppItem({
	host,
	app,
	session,
	presentation,
	onRefresh,
	onRetryStatus,
}: {
	host: MoonlightHost;
	app: MoonlightApp;
	session: HostSession;
	presentation: AppPresentation;
	onRefresh: () => void;
	onRetryStatus: () => void;
}) {
	const boxArt = resolveBoxArt(host, app);
	const command = formatCommand(
		getMoonlightBinary(),
		safeStreamArgs(host.name, app.name),
	);
	const runningName = session.runningAppName ?? "another app";

	const handleStart = useCallback(async () => {
		try {
			await startStream(host.name, app.name);
			await showToast({
				style: Toast.Style.Success,
				title: `Starting ${app.name}`,
				message: `Streaming from ${host.name}`,
			});
			await closeMainWindow();
		} catch (error) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Failed to start stream",
				message: errorMessage(error),
			});
		}
	}, [host.name, app.name]);

	const handleQuitAndStart = useCallback(async () => {
		// Validate the stream preferences before touching the host, so an
		// invalid frame rate or bitrate never quits the running app for nothing.
		try {
			streamArgs(host.name, app.name);
		} catch (error) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Failed to start stream",
				message: errorMessage(error),
			});
			return;
		}
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: `Quitting ${runningName} on ${host.name}…`,
		});
		try {
			await quitApp(host.name);
		} catch (error) {
			toast.style = Toast.Style.Failure;
			toast.title = `Failed to quit app on ${host.name}`;
			toast.message = errorMessage(error);
			onRefresh();
			return;
		}
		await handleStart();
	}, [host.name, app.name, runningName, handleStart, onRefresh]);

	const handleExplain = useCallback(async () => {
		await showToast(
			presentation.primary === "already-streaming"
				? {
						style: Toast.Style.Failure,
						title: `Already streaming ${app.name} on this PC`,
						message:
							"Switch to the Moonlight window, or end the session first.",
					}
				: {
						style: Toast.Style.Failure,
						title: `${host.name} is busy (${runningName} running)`,
						message: "Quit the running app first to start another one.",
					},
		);
	}, [presentation.primary, host.name, app.name, runningName]);

	let primary: React.ReactNode;
	switch (presentation.primary) {
		case "already-streaming":
			primary = (
				<Action
					title="Already Streaming"
					icon={Icon.Info01}
					onAction={handleExplain}
				/>
			);
			break;
		case "host-busy":
			primary = (
				<Action title="Host Busy" icon={Icon.Info01} onAction={handleExplain} />
			);
			break;
		case "resume":
			primary = (
				<Action title="Resume Stream" icon={Icon.Play} onAction={handleStart} />
			);
			break;
		case "start-unconfirmed":
			primary = (
				<Action
					title="Start Stream (Status Unknown)"
					icon={Icon.Play}
					onAction={handleStart}
				/>
			);
			break;
		default:
			primary = (
				<Action title="Start Stream" icon={Icon.Play} onAction={handleStart} />
			);
	}

	// Vicinae has no disabled list items: approximate with a muted icon.
	const icon = presentation.disabled
		? {
				value: { source: Icon.GameController, tintColor: Color.SecondaryText },
				tooltip: `Unavailable: ${runningName} is running on ${host.name}`,
			}
		: boxArt
			? { source: boxArt }
			: Icon.GameController;

	return (
		<List.Item
			id={`${host.index}:${app.id}`}
			title={app.name}
			keywords={[host.name]}
			icon={icon}
			accessories={appAccessories(app, presentation)}
			actions={
				<ActionPanel>
					<ActionPanel.Section>
						{primary}
						{presentation.offerQuitAndStart && (
							<Action
								title="Quit Running App & Start"
								icon={Icon.Play}
								onAction={handleQuitAndStart}
							/>
						)}
						<Action.CopyToClipboard
							title="Copy Stream Command"
							content={command}
							shortcut={Keyboard.Shortcut.Common.Copy}
						/>
					</ActionPanel.Section>
					<ActionPanel.Section title={host.name}>
						<HostActions
							host={host}
							session={session}
							onRefresh={onRefresh}
							onRetryStatus={onRetryStatus}
						/>
					</ActionPanel.Section>
				</ActionPanel>
			}
		/>
	);
}

/** Like streamArgs but never throws, so an invalid preference cannot break rendering. */
function safeStreamArgs(host: string, app: string): string[] {
	try {
		return streamArgs(host, app);
	} catch {
		return ["stream", host, app];
	}
}

function HostSection({
	host,
	state,
	showHidden,
	onRefresh,
	onRetryStatus,
}: {
	host: MoonlightHost;
	state: HostState;
	showHidden: boolean;
	onRefresh: () => void;
	onRetryStatus: () => void;
}) {
	const session = resolveHostSession(
		state.apps,
		state.serverInfo,
		state.localStream,
		state.statusLoading,
	);
	const apps = visibleApps(state.apps, showHidden, session.runningAppId);
	return (
		<List.Section
			title={host.name}
			subtitle={sectionSubtitle(host, state, session)}
		>
			{state.error && (
				<List.Item
					id={`${host.index}:error`}
					title={`Could not reach ${host.name}`}
					subtitle={state.error}
					icon={{ source: Icon.Warning, tintColor: Color.Orange }}
					actions={
						<ActionPanel>
							<Action
								title="Retry"
								icon={Icon.ArrowClockwise}
								onAction={onRefresh}
							/>
						</ActionPanel>
					}
				/>
			)}
			{apps.map((app) => (
				<AppItem
					key={app.id}
					host={host}
					app={app}
					session={session}
					presentation={decideAppPresentation(app, session)}
					onRefresh={onRefresh}
					onRetryStatus={onRetryStatus}
				/>
			))}
			{!state.error && !state.refreshing && apps.length === 0 && (
				<List.Item
					id={`${host.index}:empty`}
					title={
						state.apps.length > 0
							? "All apps on this host are hidden"
							: "No apps found on this host"
					}
					icon={Icon.Info01}
					actions={
						<ActionPanel>
							<HostActions
								host={host}
								session={session}
								onRefresh={onRefresh}
								onRetryStatus={onRetryStatus}
							/>
						</ActionPanel>
					}
				/>
			)}
		</List.Section>
	);
}

function StreamList({ hosts }: { hosts: MoonlightHost[] }) {
	const showHidden = useMemo(() => getPreferences().showHidden === true, []);
	const timeout = useMemo(() => getServerInfoTimeout(), []);
	useEffect(() => {
		if (timeout.error) {
			void showToast({
				style: Toast.Style.Failure,
				title: "Invalid preference",
				message: timeout.error,
			});
		}
	}, [timeout]);
	const [states, setStates] = useState<Record<number, HostState>>(() =>
		Object.fromEntries(hosts.map((h) => [h.index, initialState(h)])),
	);

	// Per-host refresh generation: results of a superseded refresh are dropped,
	// so a slow, older `moonlight list` cannot overwrite a newer result.
	const generations = useRef<Record<number, number>>({});

	const statusGenerations = useRef<Record<number, number>>({});

	/** Re-query only serverinfo and the local stream scan for a host. */
	const refreshStatus = useCallback(
		async (host: MoonlightHost) => {
			const generation = (statusGenerations.current[host.index] ?? 0) + 1;
			statusGenerations.current[host.index] = generation;
			const isCurrent = () =>
				statusGenerations.current[host.index] === generation;
			setStates((prev) => ({
				...prev,
				[host.index]: {
					...(prev[host.index] ?? initialState(host)),
					statusLoading: true,
				},
			}));
			// Session state is fast (~3 s timeout) and independent of the app list.
			await fetchServerInfo(host, timeout.ms).then((serverInfo) => {
				if (!isCurrent()) return;
				const localStream = findLocalStream(host);
				setStates((prev) => {
					const current = prev[host.index] ?? initialState(host);
					return {
						...prev,
						[host.index]: {
							...current,
							serverInfo,
							localStream,
							statusLoading: false,
						},
					};
				});
			});
		},
		[timeout.ms],
	);

	const refreshHost = useCallback(
		async (host: MoonlightHost) => {
			const generation = (generations.current[host.index] ?? 0) + 1;
			generations.current[host.index] = generation;
			const isCurrent = () => generations.current[host.index] === generation;
			setStates((prev) => ({
				...prev,
				[host.index]: {
					...(prev[host.index] ?? initialState(host)),
					refreshing: true,
				},
			}));
			void refreshStatus(host);
			try {
				const apps = await listApps(host.name);
				if (!isCurrent()) return;
				saveCachedApps(host, apps);
				setStates((prev) => ({
					...prev,
					[host.index]: {
						...(prev[host.index] ?? initialState(host)),
						apps,
						refreshing: false,
						error: undefined,
					},
				}));
			} catch (error) {
				if (!isCurrent()) return;
				setStates((prev) => {
					const current = prev[host.index] ?? initialState(host);
					return {
						...prev,
						[host.index]: {
							...current,
							refreshing: false,
							error: errorMessage(error),
						},
					};
				});
			}
		},
		[refreshStatus],
	);

	const refreshAll = useCallback(() => {
		for (const host of hosts) void refreshHost(host);
	}, [hosts, refreshHost]);

	useEffect(() => {
		refreshAll();
	}, [refreshAll]);

	const isLoading = Object.values(states).some(
		(s) => s.refreshing || s.statusLoading,
	);

	return (
		<List isLoading={isLoading} searchBarPlaceholder="Search apps to stream…">
			{hosts.map((host) => {
				const state = states[host.index];
				if (!state) return null;
				return (
					<HostSection
						key={host.index}
						host={host}
						state={state}
						showHidden={showHidden}
						onRefresh={() => void refreshHost(host)}
						onRetryStatus={() => void refreshStatus(host)}
					/>
				);
			})}
		</List>
	);
}

const INSTALL_MARKDOWN = `# Moonlight Not Found

This extension needs the [moonlight-qt](https://moonlight-stream.org) command line client.

## Installation

### NixOS
\`\`\`nix
environment.systemPackages = [ pkgs.moonlight-qt ];
\`\`\`

### Arch Linux
\`\`\`bash
sudo pacman -S moonlight-qt
\`\`\`

### Other distributions
Install moonlight-qt from your package manager or from https://moonlight-stream.org.

If moonlight is installed in a non-standard location (or you use a wrapper script, e.g. for Flatpak),
set **Moonlight Binary** in the extension preferences.
`;

const NO_HOSTS_MARKDOWN = `# No Paired Hosts

No paired hosts were found in your Moonlight configuration.

Open the Moonlight app, add your host (Sunshine or GeForce Experience) and complete pairing, then run this command again.
`;

export default function Command() {
	const binary = useMemo(() => resolveMoonlightBinary(), []);
	const result = useMemo(() => {
		const config = findConfigPath();
		// Auto-detection found nothing: treat as "no paired hosts".
		if (!config.path) return { hosts: [] as MoonlightHost[] };
		try {
			return { hosts: readHosts(config.path), configPath: config.path };
		} catch (error) {
			return {
				hosts: [] as MoonlightHost[],
				configPath: config.path,
				error: errorMessage(error),
			};
		}
	}, []);

	if (!binary) {
		return <Detail markdown={INSTALL_MARKDOWN} />;
	}
	if (result.error) {
		return (
			<Detail
				markdown={`# Could Not Read Moonlight Configuration\n\n\`${result.configPath}\`\n\n${result.error}`}
			/>
		);
	}
	if (result.hosts.length === 0) {
		return <Detail markdown={NO_HOSTS_MARKDOWN} />;
	}
	return <StreamList hosts={result.hosts} />;
}
