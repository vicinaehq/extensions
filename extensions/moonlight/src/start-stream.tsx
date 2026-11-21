import { useCallback, useEffect, useMemo, useState } from "react";
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
	hasLocalStream,
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
	type AppAction,
	decideAppAction,
	type ServerInfo,
} from "./lib/session";

interface HostState {
	apps: MoonlightApp[];
	/** True while a background refresh is running. */
	refreshing: boolean;
	error?: string;
	/** Host state from serverinfo; undefined while unknown. */
	serverInfo?: ServerInfo;
	/** Whether this PC is already running `moonlight stream` for the host. */
	localStream: boolean;
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
		localStream: hasLocalStream(host),
		statusLoading: true,
	};
}

function sectionSubtitle(host: MoonlightHost, state: HostState): string {
	const address = host.localAddress ?? host.manualAddress ?? host.remoteAddress;
	const parts =
		address && address.toLowerCase() !== host.name.toLowerCase()
			? [address]
			: [];
	if (state.localStream) parts.push("streaming on this PC");
	else if (state.serverInfo?.state === "busy") parts.push("busy");
	if (state.refreshing) parts.push("refreshing…");
	else if (state.error)
		parts.push(
			state.apps.length > 0 ? "offline, showing cached apps" : "offline",
		);
	return parts.join(" · ");
}

function HostActions({
	host,
	onRefresh,
}: {
	host: MoonlightHost;
	onRefresh: () => void;
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

	return (
		<>
			<Action
				title="Quit Running App on Host"
				icon={Icon.XMarkCircle}
				style="destructive"
				shortcut={{ modifiers: ["ctrl"], key: "q" }}
				onAction={handleQuit}
			/>
			<Action
				title="Refresh"
				icon={Icon.ArrowClockwise}
				shortcut={Keyboard.Shortcut.Common.Refresh}
				onAction={onRefresh}
			/>
		</>
	);
}

function appAccessories(app: MoonlightApp, action: AppAction) {
	const accessories: List.Item.Accessory[] = [];
	if (action.kind === "already-streaming") {
		accessories.push({
			tag: { value: "Already streaming", color: Color.Blue },
		});
	} else if (action.kind === "resume") {
		accessories.push({ tag: { value: "Running", color: Color.Green } });
	}
	if (app.hdr) accessories.push({ tag: "HDR" });
	if (app.hidden) {
		accessories.push({
			icon: Icon.EyeDisabled,
			tooltip: "Hidden in Moonlight",
		});
	}
	return accessories;
}

function AppItem({
	host,
	app,
	action,
	onRefresh,
}: {
	host: MoonlightHost;
	app: MoonlightApp;
	action: AppAction;
	onRefresh: () => void;
}) {
	const boxArt = resolveBoxArt(host, app);
	const command = formatCommand(
		getMoonlightBinary(),
		safeStreamArgs(host.name, app.name),
	);

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
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: `Quitting ${action.runningAppName ?? "running app"} on ${host.name}…`,
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
	}, [host.name, action.runningAppName, handleStart, onRefresh]);

	const handleAlreadyStreaming = useCallback(async () => {
		await showToast({
			style: Toast.Style.Failure,
			title: `Already streaming from ${host.name}`,
			message:
				"Moonlight is already streaming this host on this PC. Close that stream first.",
		});
	}, [host.name]);

	let primary: React.ReactNode;
	switch (action.kind) {
		case "already-streaming":
			primary = (
				<Action
					title="Show Why Streaming Is Unavailable"
					icon={Icon.Info01}
					onAction={handleAlreadyStreaming}
				/>
			);
			break;
		case "resume":
			primary = (
				<Action title="Resume Stream" icon={Icon.Play} onAction={handleStart} />
			);
			break;
		case "quit-and-start":
			primary = (
				<Action
					title="Quit Running App & Start"
					icon={Icon.Play}
					onAction={handleQuitAndStart}
				/>
			);
			break;
		default:
			primary = (
				<Action title="Start Stream" icon={Icon.Play} onAction={handleStart} />
			);
	}

	const subtitle =
		action.kind === "quit-and-start" && action.runningAppName
			? `${action.runningAppName} is running`
			: undefined;

	return (
		<List.Item
			id={`${host.index}:${app.id}`}
			title={app.name}
			keywords={[host.name]}
			icon={boxArt ? { source: boxArt } : Icon.GameController}
			subtitle={subtitle}
			accessories={appAccessories(app, action)}
			actions={
				<ActionPanel>
					<ActionPanel.Section>
						{primary}
						<Action.CopyToClipboard
							title="Copy Stream Command"
							content={command}
							shortcut={Keyboard.Shortcut.Common.Copy}
						/>
					</ActionPanel.Section>
					<ActionPanel.Section title={host.name}>
						<HostActions host={host} onRefresh={onRefresh} />
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
	onRefresh,
}: {
	host: MoonlightHost;
	state: HostState;
	onRefresh: () => void;
}) {
	return (
		<List.Section title={host.name} subtitle={sectionSubtitle(host, state)}>
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
			{state.apps.map((app) => (
				<AppItem
					key={app.id}
					host={host}
					app={app}
					action={decideAppAction(
						app,
						state.apps,
						state.serverInfo,
						state.localStream,
					)}
					onRefresh={onRefresh}
				/>
			))}
			{!state.error && !state.refreshing && state.apps.length === 0 && (
				<List.Item
					id={`${host.index}:empty`}
					title="No apps found on this host"
					icon={Icon.Info01}
					actions={
						<ActionPanel>
							<HostActions host={host} onRefresh={onRefresh} />
						</ActionPanel>
					}
				/>
			)}
		</List.Section>
	);
}

function StreamList({ hosts }: { hosts: MoonlightHost[] }) {
	const [states, setStates] = useState<Record<number, HostState>>(() =>
		Object.fromEntries(hosts.map((h) => [h.index, initialState(h)])),
	);

	const refreshHost = useCallback(async (host: MoonlightHost) => {
		setStates((prev) => ({
			...prev,
			[host.index]: {
				...(prev[host.index] ?? initialState(host)),
				refreshing: true,
				statusLoading: true,
			},
		}));
		// Session state is fast (~3 s timeout) and independent of the app list.
		void fetchServerInfo(host).then((serverInfo) => {
			const localStream = hasLocalStream(host);
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
		try {
			const apps = await listApps(host.name);
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
	}, []);

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
						onRefresh={() => void refreshHost(host)}
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
		try {
			return { hosts: readHosts(), configPath: findConfigPath() };
		} catch (error) {
			return {
				hosts: [],
				configPath: findConfigPath(),
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
