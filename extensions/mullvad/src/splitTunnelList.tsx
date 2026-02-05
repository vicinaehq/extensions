import { Action, ActionPanel, confirmAlert, Detail, getApplications, Icon, List, showToast } from "@vicinae/api";
import { showFailureToast, useExec } from "@raycast/utils";
import { execSync } from "node:child_process";
import { useEffect, useState } from "react";
import { mullvadNotInstalledHint } from "./utils";

interface ProcessInfo {
	pid: string;
	ppid: string;
	command: string;
	fullCommand: string;
	isRunning: boolean;
	cgroup?: string; // Optional: for detecting related processes on Linux
}

interface GroupedProcess {
	command: string;
	fullCommand: string;
	pids: string[];
	isRunning: boolean;
}

function parseProcessesInfo(pids: string[]): Map<string, ProcessInfo> {
	const processMap = new Map<string, ProcessInfo>();
	
	if (pids.length === 0) return processMap;

	try {
		// Call ps once with all PIDs for better performance
		// Include PPID to identify parent-child relationships
		const pidList = pids.join(",");
		const output = execSync(`ps -p ${pidList} -o pid,ppid,comm,args --no-headers`).toString().trim();

		if (!output) return processMap;

		const lines = output.split("\n");
		for (const line of lines) {
			// ps output format has fixed-width columns:
			// PID PPID COMM ARGS
			// Split by whitespace, handling the fixed-width comm field
			const parts = line.trim().split(/\s+/);
			if (parts.length >= 4) {
				const pid = parts[0];
				const ppid = parts[1];
				const command = parts[2];
				// Everything after the 3rd field is the args
				const fullCommand = parts.slice(3).join(" ");
				
				// Try to read cgroup for this process
				let cgroup: string | undefined;
				try {
					const cgroupData = execSync(`cat /proc/${pid}/cgroup 2>/dev/null`).toString();
					// Extract the systemd scope/service from the cgroup
					// Format: 0::/user.slice/.../app-Hyprland-mullvad\x2dexclude-XXX.scope
					const match = cgroupData.match(/0::.*\/(app-[^\/]+\.scope|session-[^\/]+\.scope)/);
					if (match) {
						cgroup = match[1];
					}
				} catch {
					// Ignore if we can't read cgroup
				}
				
				processMap.set(pid, {
					pid,
					ppid,
					command,
					fullCommand: fullCommand || command,
					isRunning: true,
					cgroup,
				});
			}
		}
	} catch (error) {
		// Some or all processes may no longer exist, continue with what we have
	}

	// Mark PIDs that weren't found as not running
	for (const pid of pids) {
		if (!processMap.has(pid)) {
			processMap.set(pid, {
				pid,
				ppid: "0",
				command: "Unknown",
				fullCommand: `Process ${pid} (no longer running)`,
				isRunning: false,
			});
		}
	}

	return processMap;
}

function groupProcessesByCommand(
	processMap: Map<string, ProcessInfo>,
	installedAppCommands: Set<string>
): GroupedProcess[] {
	const groups = new Map<string, GroupedProcess>();
	const pidSet = new Set(processMap.keys());
	const rootCache = new Map<string, ProcessInfo>();
	const appRootsByCgroupCommand = new Map<string, number>();
	
	function tokenizeCommand(command: string): string[] {
		return command
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter(Boolean);
	}
	
	// Helper function to check if a command is a "real application"
	// Real apps are in the installed apps list from getApplications()
	function isRealApplication(command: string): boolean {
		const commandLower = command.toLowerCase();
		if (installedAppCommands.has(commandLower)) return true;
		return tokenizeCommand(commandLower).some((token) => installedAppCommands.has(token));
	}
	
	// Helper function to find the "application root" for a process
	// Strategy: Find the NEAREST real application in the parent chain
	function findApplicationRoot(proc: ProcessInfo): ProcessInfo {
		const cached = rootCache.get(proc.pid);
		if (cached) return cached;
		
		let current = proc;
		let visited = new Set<string>();
		
		// First, try to trace back through parents looking for the first real app
		while (pidSet.has(current.ppid) && !visited.has(current.pid)) {
			visited.add(current.pid);
			
			const parent = processMap.get(current.ppid);
			if (!parent) break;
			
			// If parent is a real application, use it!
			if (isRealApplication(parent.command)) {
				rootCache.set(proc.pid, parent);
				return parent;
			}
			
			current = parent;
		}
		
		// No real app found in parent chain via PPID
		// Progressive enhancement: On Linux, try to find a real app in the same cgroup
		// This helps group daemonized processes (like prettierd) with their launcher (like wezterm)
		if (proc.cgroup && !isRealApplication(proc.command)) {
			let cgroupRoot: ProcessInfo | null = null;
			for (const other of processMap.values()) {
				if (other.cgroup === proc.cgroup && isRealApplication(other.command)) {
					if (!cgroupRoot || Number(other.pid) < Number(cgroupRoot.pid)) {
						cgroupRoot = other;
					}
				}
			}
			
			if (cgroupRoot) {
				rootCache.set(proc.pid, cgroupRoot);
				return cgroupRoot;
			}
		}
		
		// Fallback: no real app anywhere
		// If current process itself is a real app, use it
		if (isRealApplication(proc.command)) {
			rootCache.set(proc.pid, proc);
			return proc;
		}
		
		// Final fallback: return the process itself
		// (will be grouped by command name)
		rootCache.set(proc.pid, proc);
		return proc;
	}
	
	// Precompute how many "real app" roots exist per cgroup+command
	for (const proc of processMap.values()) {
		const root = findApplicationRoot(proc);
		if (isRealApplication(root.command) && root.cgroup) {
			const key = `${root.cgroup}:${root.command.toLowerCase()}`;
			appRootsByCgroupCommand.set(key, (appRootsByCgroupCommand.get(key) || 0) + 1);
		}
	}

	// Group processes by their application root
	const pidGroups = new Map<string, ProcessInfo[]>();
	
	for (const proc of processMap.values()) {
		const root = findApplicationRoot(proc);
		
		// If root is a real app, group by its PID
		// Otherwise, group by command name (for similar non-app processes)
		let groupKey: string;
		if (isRealApplication(root.command)) {
			const rootCommand = root.command.toLowerCase();
			const rootCgroup = root.cgroup ? `${root.cgroup}:${rootCommand}` : undefined;
			const similarRoots = rootCgroup ? appRootsByCgroupCommand.get(rootCgroup) || 0 : 0;
			groupKey = similarRoots > 1 ? `cmd:${rootCommand}` : `pid:${root.pid}`;
		} else {
			groupKey = `cmd:${root.command}`;
		}
		
		if (!pidGroups.has(groupKey)) {
			pidGroups.set(groupKey, [proc]);
		} else {
			pidGroups.get(groupKey)!.push(proc);
		}
	}
	
	// Convert to GroupedProcess array
	for (const [groupKey, procs] of pidGroups.entries()) {
		// Determine the display command (use the root's command)
		const root = findApplicationRoot(procs[0]);
		
		groups.set(groupKey, {
			command: root.command,
			fullCommand: root.fullCommand,
			pids: procs.map(p => p.pid),
			isRunning: procs.some(p => p.isRunning),
		});
	}

	return Array.from(groups.values()).sort((a, b) => a.command.localeCompare(b.command));
}

function getIconForProcess(group: GroupedProcess, appIconMap: Map<string, string>): string | Icon {
	// Extract just the executable name from the path for matching
	// e.g., "/app/zen/zen" -> "zen"
	const executableName = group.command.split('/').pop()?.toLowerCase() || group.command.toLowerCase();
	
	// Try exact match on executable name first
	if (appIconMap.has(executableName)) {
		return appIconMap.get(executableName)!;
	}
	
	// Try to find by partial match in app names
	for (const [appName, icon] of appIconMap) {
		const appNameLower = appName.toLowerCase();
		// Check if executable name is contained in app name or vice versa
		if (appNameLower.includes(executableName) || executableName.includes(appNameLower)) {
			return icon;
		}
	}
	
	// Try to extract .app bundle path from the full command (macOS)
	const appMatch = group.fullCommand.match(/(.+?\.app)\//);
	if (appMatch) {
		return appMatch[1];
	}
	
	// Fallback to terminal icons based on running status
	return group.isRunning ? Icon.Terminal : Icon.XMarkCircle;
}

export default function Command() {
	const [appIconMap, setAppIconMap] = useState<Map<string, string>>(new Map());
	const [installedAppCommands, setInstalledAppCommands] = useState<Set<string>>(new Set());
	
	// Fetch installed applications to build icon map and command set
	useEffect(() => {
		getApplications().then((apps) => {
			const iconMap = new Map<string, string>();
			const commandSet = new Set<string>();
			
			function addCommandVariants(value: string | undefined) {
				if (!value) return;
				const lowerValue = value.toLowerCase();
				commandSet.add(lowerValue);
				const tokens = lowerValue.split(/[^a-z0-9]+/).filter(Boolean);
				for (const token of tokens) {
					if (token.length > 2) {
						commandSet.add(token);
					}
				}
			}
			
			function addIconVariants(value: string, icon: string) {
				const tokens = value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
				for (const token of tokens) {
					if (token.length > 2 && !iconMap.has(token)) {
						iconMap.set(token, icon);
					}
				}
			}
			
			for (const app of apps) {
				// Store by lowercase app name for matching
				const nameLower = app.name.toLowerCase();
				iconMap.set(nameLower, app.icon);
				addCommandVariants(app.name);
				addIconVariants(nameLower, app.icon);
				
				// Try to extract command from app path
				// e.g., /usr/bin/zen -> zen
				if (app.path) {
					const pathParts = app.path.split('/');
					const executable = pathParts[pathParts.length - 1];
					addCommandVariants(executable);
				}
			}
			
			setAppIconMap(iconMap);
			setInstalledAppCommands(commandSet);
		}).catch((error) => {
			console.error("Failed to load applications:", error);
		});
	}, []);
	
	const isMullvadInstalled = useExec("mullvad", ["--version"]);
	const rawSplitTunnelList = useExec("mullvad", ["split-tunnel", "list"], {
		execute: !!isMullvadInstalled.data,
	});

	if (rawSplitTunnelList.isLoading || isMullvadInstalled.isLoading) return <List isLoading={true} />;
	if (!isMullvadInstalled.data || isMullvadInstalled.error) return <Detail markdown={mullvadNotInstalledHint} />;
	if (rawSplitTunnelList.error) return <Detail markdown={rawSplitTunnelList.error.message} />;

	// Parse the output from "mullvad split-tunnel list"
	// Expected format:
	// Excluded PIDs:
	// 1234
	// 5678
	const lines = (rawSplitTunnelList.data || "").split("\n");
	const pids = lines.slice(1).filter((line) => line.trim() && /^\d+$/.test(line.trim())).map((line) => line.trim());
	
	const processMap = parseProcessesInfo(pids);
	const groupedProcesses = groupProcessesByCommand(processMap, installedAppCommands);

	async function removeProcessGroup(group: GroupedProcess) {
		const confirmed = await confirmAlert({
			title: `Remove ${group.command}?`,
			message: `This will remove ${group.pids.length} process${group.pids.length > 1 ? "es" : ""} from split-tunnel:\n${group.pids.join(", ")}`,
			icon: "mullvad-icon.png",
		});

		if (!confirmed) return;

		try {
			for (const pid of group.pids) {
				execSync(`mullvad split-tunnel delete ${pid}`);
			}
			showToast({ title: `Removed ${group.command}`, message: `${group.pids.length} process${group.pids.length > 1 ? "es" : ""}` });
			rawSplitTunnelList.revalidate();
		} catch (error) {
			if (error instanceof Error)
				showFailureToast({ title: "Failed to remove processes", message: error.message });
		}
	}

	async function clearAllSplitTunnel() {
		if (pids.length === 0) {
			showToast({ title: "Nothing to clear" });
			return;
		}

		const confirmed = await confirmAlert({
			title: "Clear All Excluded Processes?",
			message: `This will remove all ${pids.length} process${pids.length > 1 ? "es" : ""} from the split-tunnel list.`,
			icon: "mullvad-icon.png",
		});

		if (!confirmed) return;

		try {
			execSync("mullvad split-tunnel clear");
			showToast({ title: "Cleared all excluded processes" });
			rawSplitTunnelList.revalidate();
		} catch (error) {
			if (error instanceof Error)
				showFailureToast({ title: "Failed to clear split-tunnel", message: error.message });
		}
	}

	const hasProcesses = groupedProcesses.length > 0;
	const totalPids = pids.length;

	return (
		<List
			isLoading={rawSplitTunnelList.isLoading}
			searchBarPlaceholder="Search excluded processes..."
			isShowingDetail={hasProcesses}
		>
			{!hasProcesses ? (
				<List.EmptyView
					icon={Icon.CheckCircle}
					title="No Excluded Processes"
					description="All applications are using the VPN tunnel"
				/>
			) : (
				<List.Section title={`${groupedProcesses.length} Program${groupedProcesses.length > 1 ? "s" : ""} (${totalPids} process${totalPids > 1 ? "es" : ""})`}>
					{groupedProcesses.map((group) => (
						<List.Item
							key={group.pids.join(",")}
							icon={getIconForProcess(group, appIconMap)}
							title={group.command}
							keywords={[...group.pids, group.command, group.fullCommand]}
							accessories={[
								{ text: `${group.pids.length} process${group.pids.length > 1 ? "es" : ""}`, icon: Icon.Hashtag },
							]}
							detail={
								<List.Item.Detail
									metadata={
										<List.Item.Detail.Metadata>
											<List.Item.Detail.Metadata.Label title="Command" text={group.command} icon={Icon.Terminal} />
											<List.Item.Detail.Metadata.Label title="Process Count" text={`${group.pids.length}`} icon={Icon.Hashtag} />
											<List.Item.Detail.Metadata.Separator />
											<List.Item.Detail.Metadata.Label
												title="Status"
												text={group.isRunning ? "Running" : "Not Running"}
												icon={group.isRunning ? Icon.CircleFilled : Icon.Circle}
											/>
											<List.Item.Detail.Metadata.Separator />
											<List.Item.Detail.Metadata.Label title="PIDs" text={group.pids.join(", ")} />
											<List.Item.Detail.Metadata.Separator />
											<List.Item.Detail.Metadata.Label title="Full Command" text={group.fullCommand} />
										</List.Item.Detail.Metadata>
									}
								/>
							}
							actions={
								<ActionPanel>
									<Action
										title={`Remove ${group.command}`}
										icon={Icon.Trash}
										onAction={() => removeProcessGroup(group)}
										shortcut={{ modifiers: ["cmd"], key: "delete" }}
									/>
									<Action.CopyToClipboard
										content={group.pids.join(", ")}
										title="Copy PIDs"
										shortcut={{ modifiers: ["cmd"], key: "c" }}
									/>
									<Action.CopyToClipboard
										content={group.fullCommand}
										title="Copy Full Command"
										shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
									/>
									<ActionPanel.Section>
										<Action
											title="Clear All Excluded Processes"
											icon={Icon.XMarkCircle}
											onAction={clearAllSplitTunnel}
											shortcut={{ modifiers: ["cmd", "shift"], key: "delete" }}
											style={Action.Style.Destructive}
										/>
									</ActionPanel.Section>
								</ActionPanel>
							}
						/>
					))}
				</List.Section>
			)}
		</List>
	);
}
