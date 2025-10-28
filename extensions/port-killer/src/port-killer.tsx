import { exec } from "node:child_process";
import util from "node:util";
import {
	Action,
	ActionPanel,
	Clipboard,
	Icon,
	List,
	showToast,
} from "@vicinae/api";
import { useEffect, useState } from "react";

const execPromise = util.promisify(exec);

const MIN_USER_PORT = 1024;
const MAX_PORT = 65535;

interface OpenPort {
	protocol: string;
	port: number;
	pid: number | null;
	process: string;
	user: string;
	address: string;
}

async function listOpenPorts(): Promise<OpenPort[]> {
	try {
		const { stdout } = await execPromise("ss -tulnp 2>/dev/null || true");

		const lines = stdout
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l && !l.startsWith("Netid") && !l.startsWith("State"));

		const result: OpenPort[] = [];
		const seenPorts = new Set<string>();

		for (const line of lines) {
			const addressMatch = line.match(/^(\S+)\s+\S+\s+\S+\s+\S+\s+(\S+:\d+)/);
			if (!addressMatch) continue;

			const protocol = addressMatch[1];
			const localAddress = addressMatch[2];

			let port: number | null = null;
			const portMatch = localAddress.match(/:(\d+)$/);
			if (portMatch) {
				port = parseInt(portMatch[1], 10);
			}

			if (port === null || Number.isNaN(port)) continue;
			if (port < MIN_USER_PORT || port > MAX_PORT) continue;

			let process = "unknown";
			let pid: number | null = null;

			const usersMatch = line.match(/users:\(\((.+)\)\)/);
			if (usersMatch) {
				const usersContent = usersMatch[1];

				const processMatch = usersContent.match(/"([^"]+)"/);
				if (processMatch) {
					process = processMatch[1];
				}

				const pidMatch = usersContent.match(/pid=(\d+)/);
				if (pidMatch) {
					pid = parseInt(pidMatch[1], 10);
				}
			}

			const portKey = `${protocol}-${port}-${pid || "none"}`;
			if (seenPorts.has(portKey)) continue;
			seenPorts.add(portKey);

			result.push({
				protocol,
				port,
				pid,
				process,
				user: "current",
				address: localAddress,
			});
		}

		return result.sort((a, b) => {
			if (a.process === "unknown" && b.process !== "unknown") return 1;
			if (a.process !== "unknown" && b.process === "unknown") return -1;
			return a.port - b.port;
		});
	} catch (error) {
		console.error("Error listing ports:", error);
		return [];
	}
}

async function killProcessByPort(port: number): Promise<void> {
	const ports = await listOpenPorts();
	const targets = ports.filter((p) => p.port === port && p.pid !== null);

	if (targets.length === 0) {
		throw new Error(`No killable process found on port ${port}`);
	}

	const errors: string[] = [];
	for (const target of targets) {
		if (target.pid === null) continue;

		try {
			await execPromise(
				`kill ${target.pid} 2>/dev/null || kill -9 ${target.pid} 2>/dev/null`,
			);
		} catch {
			errors.push(`Failed to kill PID ${target.pid}`);
		}
	}

	if (errors.length === targets.length) {
		throw new Error(`Failed to kill all processes on port ${port}`);
	}

	await new Promise((resolve) => setTimeout(resolve, 100));
}

export default function PortKiller() {
	const [ports, setPorts] = useState<OpenPort[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	const refreshPorts = async () => {
		setIsLoading(true);
		try {
			const newPorts = await listOpenPorts();
			setPorts(newPorts);
		} catch (error) {
			showToast({
				title: "Failed to list ports",
				message: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		refreshPorts();
	}, []);

	const handleKillPort = async (port: OpenPort) => {
		if (port.pid === null) {
			showToast({
				title: "Cannot kill port",
				message: "No process ID available",
			});
			return;
		}

		try {
			await killProcessByPort(port.port);
			showToast({
				title: `Killed process on port ${port.port}`,
				message: `${port.process} (PID: ${port.pid})`,
			});
			await refreshPorts();
		} catch (error) {
			showToast({
				title: "Failed to kill process",
				message: error instanceof Error ? error.message : "Unknown error",
			});
		}
	};

	return (
		<List
			isLoading={isLoading}
			searchBarPlaceholder="Search ports by number or process name..."
		>
			{ports.length === 0 && !isLoading ? (
				<List.EmptyView
					title="No open ports found"
					description={`No listening ports found in range ${MIN_USER_PORT}-${MAX_PORT}`}
				/>
			) : (
				<List.Section
					title="Open Ports"
					subtitle={`${ports.length} port${ports.length !== 1 ? "s" : ""} listening`}
				>
					{ports.map((port) => (
						<List.Item
							key={`${port.protocol}-${port.port}-${port.pid || "unknown"}`}
							title={`Port ${port.port}`}
							subtitle={`${port.process}${port.pid ? ` (PID: ${port.pid})` : ""}`}
							accessories={[
								{ text: port.protocol.toUpperCase() },
								{ text: port.address },
							]}
							actions={
								<ActionPanel>
									<Action
										title="Kill Process"
										icon={Icon.XMarkCircle}
										onAction={() => handleKillPort(port)}
									/>
									<Action
										title="Copy Port"
										icon={Icon.CopyClipboard}
										shortcut={{ modifiers: ["cmd"], key: "c" }}
										onAction={async () =>
											await Clipboard.copy({ text: port.port.toString() })
										}
									/>
									<Action
										title="Copy PID"
										icon={Icon.CopyClipboard}
										onAction={async () =>
											await Clipboard.copy({ text: port.pid?.toString() ?? "" })
										}
									/>
									<Action
										title="Copy Address"
										icon={Icon.CopyClipboard}
										onAction={async () =>
											await Clipboard.copy({ text: port.address })
										}
									/>
									<Action
										title="Copy Name"
										icon={Icon.CopyClipboard}
										onAction={async () =>
											await Clipboard.copy({ text: port.process })
										}
									/>
									<Action
										title="Refresh List"
										icon={Icon.ArrowClockwise}
										shortcut={{ modifiers: ["cmd"], key: "r" }}
										onAction={refreshPorts}
									/>
								</ActionPanel>
							}
						/>
					))}
				</List.Section>
			)}
		</List>
	);
}
