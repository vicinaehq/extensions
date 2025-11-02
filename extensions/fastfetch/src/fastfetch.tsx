import { exec } from "node:child_process";
import util from "node:util";
import {
	Action,
	ActionPanel,
	Clipboard,
	Color,
	Icon,
	List,
	showToast,
} from "@vicinae/api";
import { useEffect, useState } from "react";

const execPromise = util.promisify(exec);

interface FastFetchResult {
	output: string;
	error?: string;
}

type FastfetchEntry = {
	type: string;
	result?: unknown;
	error?: string;
};

interface FastfetchJsonResult {
	entries: FastfetchEntry[];
	jsonString: string;
	error?: string;
}

async function runFastFetch(): Promise<FastFetchResult> {
	try {
		const { stdout, stderr } = await execPromise("fastfetch", {
			timeout: 10000, // 10 second timeout
		});

		return {
			output: stdout.trim(),
			error: stderr.trim() || undefined,
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";

		// Check if fastfetch is not installed
		if (
			errorMessage.includes("command not found") ||
			errorMessage.includes("ENOENT")
		) {
			return {
				output: "",
				error: "FastFetch is not installed. Please install it first.",
			};
		}

		return {
			output: "",
			error: errorMessage,
		};
	}
}

async function runFastFetchJson(): Promise<FastfetchJsonResult> {
	try {
		const { stdout, stderr } = await execPromise("fastfetch --json", {
			timeout: 10000,
		});

		let parsed: unknown;
		try {
			parsed = JSON.parse(stdout);
		} catch (e) {
			return {
				entries: [],
				jsonString: stdout.trim(),
				error: "Failed to parse fastfetch JSON output",
			};
		}

		const entries = Array.isArray(parsed) ? (parsed as FastfetchEntry[]) : [];
		return { entries, jsonString: JSON.stringify(entries, null, 2), error: stderr.trim() || undefined };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return { entries: [], jsonString: "[]", error: message };
	}
}

function findEntry<T = any>(entries: FastfetchEntry[], type: string): T | undefined {
    const e = entries.find((x) => x.type === type);
    return e?.result as T | undefined;
}

function bytesToHuman(bytes?: number | null): string {
	if (!bytes && bytes !== 0) return "-";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let b = Math.max(0, Number(bytes));
	let i = 0;
	while (b >= 1024 && i < units.length - 1) {
		b /= 1024;
		i++;
	}
	return `${b.toFixed(1)} ${units[i]}`;
}

function secondsToDHMS(totalSeconds?: number | null): string {
	if (!totalSeconds && totalSeconds !== 0) return "-";
	const s = Math.max(0, Math.floor(totalSeconds));
	const d = Math.floor(s / 86400);
	const h = Math.floor((s % 86400) / 3600);
	const m = Math.floor((s % 3600) / 60);
	const parts = [
		...(d ? [`${d}d`] : []),
		...(h ? [`${h}h`] : []),
		...(m ? [`${m}m`] : []),
	];
	return parts.length ? parts.join(" ") : `${s}s`;
}

export default function FastFetch() {
	const [raw, setRaw] = useState<FastFetchResult | null>(null);
	const [json, setJson] = useState<FastfetchJsonResult | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [viewMode, setViewMode] = useState<"panels" | "raw">("panels");

	const loadFastFetch = async () => {
		setIsLoading(true);
		try {
			const [rawRes, jsonRes] = await Promise.all([
				runFastFetch(),
				runFastFetchJson(),
			]);
			setRaw(rawRes);
			setJson(jsonRes);

			if ((rawRes.error && !rawRes.output) || jsonRes.error) {
				showToast({
					title: "FastFetch Warning",
					message: rawRes.error || jsonRes.error,
				});
			}
		} catch (error) {
			showToast({
				title: "Failed to run FastFetch",
				message: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		loadFastFetch();
	}, []);

	if (isLoading) {
		return (
			<List isLoading={true}>
				<List.EmptyView
					title="Running FastFetch..."
					description="Fetching system information"
					icon={Icon.Clock}
				/>
			</List>
		);
	}

    if ((!raw || (raw.error && !raw.output)) && (!json || json.entries.length === 0)) {
		return (
			<List>
				<List.EmptyView
					title="FastFetch Error"
                    description={raw?.error || json?.error || "Failed to run FastFetch"}
					icon={Icon.XMarkCircle}
				/>
			</List>
		);
	}

    // Raw view
    if (viewMode === "raw" && raw) {
        const markdownOutput = `\`\`\`\n${raw.output}\n\`\`\``;
        return (
            <List isShowingDetail>
                <List.Item
                    title="System Information"
                    subtitle="FastFetch Raw Output"
                    icon={Icon.Terminal}
                    detail={<List.Item.Detail markdown={markdownOutput} />}
                    actions={
                        <ActionPanel>
                            <Action
                                title="Switch to Panels"
                                icon={Icon.AppWindow}
                                onAction={() => setViewMode("panels")}
                            />
                            <Action
                                title="Copy Raw Output"
                                icon={Icon.CopyClipboard}
                                shortcut={{ modifiers: ["cmd"], key: "c" }}
                                onAction={async () => {
                                    await Clipboard.copy({ text: raw.output });
                                    showToast({ title: "Copied", message: "Raw output copied" });
                                }}
                            />
                            <Action
                                title="Refresh"
                                icon={Icon.ArrowClockwise}
                                shortcut={{ modifiers: ["cmd"], key: "r" }}
                                onAction={loadFastFetch}
                            />
                        </ActionPanel>
                    }
                />
            </List>
        );
    }

    // Panels view
    const entries = json?.entries ?? [];
    type OsInfo = { name?: string; prettyName?: string; version?: string; id?: string };
    type KernelInfo = { name?: string; release?: string; version?: string; architecture?: string };
    type UptimeInfo = { uptime?: number };
    type PackagesInfo = { all?: number; pacman?: number; flatpakSystem?: number; flatpakUser?: number };
    type ShellInfo = { prettyName?: string; version?: string };
    type DeInfo = { prettyName?: string; version?: string };
    type WmInfo = { prettyName?: string; protocolName?: string };
    type CpuInfo = { cpu?: string; vendor?: string; cores?: { physical?: number; logical?: number } };
    type GpuInfo = { name?: string; vendor?: string; driver?: string; type?: string };
    type MemoryInfo = { total?: number; used?: number };
    type DiskInfo = { name?: string; filesystem?: string; mountpoint?: string; bytes?: { total?: number; used?: number; available?: number } };
    type NetIf = { name?: string; ipv4?: string };
    type Battery = { capacity?: number; status?: string; modelName?: string };

    const os = findEntry<OsInfo>(entries, "OS");
    const kernel = findEntry<KernelInfo>(entries, "Kernel");
    const uptime = findEntry<UptimeInfo>(entries, "Uptime");
    const pkgs = findEntry<PackagesInfo>(entries, "Packages");
    const shell = findEntry<ShellInfo>(entries, "Shell");
    const de = findEntry<DeInfo>(entries, "DE");
    const wm = findEntry<WmInfo>(entries, "WM");
    const cpu = findEntry<CpuInfo>(entries, "CPU");
    const gpus = (findEntry<GpuInfo[]>(entries, "GPU") || []) as GpuInfo[];
    const mem = findEntry<MemoryInfo>(entries, "Memory");
    const disks = (findEntry<DiskInfo[]>(entries, "Disk") || []) as DiskInfo[];
    const nets = (findEntry<NetIf[]>(entries, "LocalIp") || []) as NetIf[];
    const batteries = (findEntry<Battery[]>(entries, "Battery") || []) as Battery[];

    return (
        <List isShowingDetail searchBarPlaceholder="Search sections...">
            <List.Section title="System">
                <List.Item
                    title={os?.prettyName || os?.name || "Operating System"}
                    subtitle={os?.version || os?.id || "OS"}
                    icon={Icon.ComputerChip}
                    detail={
                        <List.Item.Detail
                            metadata={
                                <List.Item.Detail.Metadata>
                                    <List.Item.Detail.Metadata.Label title="Name" text={os?.prettyName || os?.name || "-"} />
                                    <List.Item.Detail.Metadata.Label title="Version" text={os?.version || "-"} />
                                    <List.Item.Detail.Metadata.Separator />
                                    <List.Item.Detail.Metadata.Label title="Kernel" text={`${kernel?.name || "Linux"} ${kernel?.release || "-"}`} />
                                    <List.Item.Detail.Metadata.Label title="Architecture" text={kernel?.architecture || "-"} />
                                    <List.Item.Detail.Metadata.Label title="Uptime" text={secondsToDHMS(uptime?.uptime)} />
                                </List.Item.Detail.Metadata>
                            }
                        />
                    }
                    actions={
                        <ActionPanel>
                            <Action title="Switch to Raw" icon={Icon.Terminal} onAction={() => setViewMode("raw")} />
                            <Action
                                title="Copy JSON"
                                icon={Icon.Clipboard}
                                onAction={async () => {
                                    await Clipboard.copy({ text: json?.jsonString || "" });
                                    showToast({ title: "Copied", message: "JSON copied" });
                                }}
                            />
                            <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut={{ modifiers: ["cmd"], key: "r" }} onAction={loadFastFetch} />
                        </ActionPanel>
                    }
                />
            </List.Section>

            <List.Section title="Hardware">
                <List.Item
                    title={cpu?.cpu || "CPU"}
                    subtitle={cpu?.vendor || "Processor"}
                    icon={Icon.ComputerChip}
                    detail={
                        <List.Item.Detail
                            metadata={
                                <List.Item.Detail.Metadata>
                                    <List.Item.Detail.Metadata.Label title="Cores (physical)" text={String(cpu?.cores?.physical ?? "-")} />
                                    <List.Item.Detail.Metadata.Label title="Cores (logical)" text={String(cpu?.cores?.logical ?? "-")} />
                                </List.Item.Detail.Metadata>
                            }
                        />
                    }
                />

                {gpus.map((g, i) => (
                    <List.Item
                        key={`gpu-${i}-${g.name}`}
                        title={g.name || "GPU"}
                        subtitle={g.vendor || g.driver || g.type || "Graphics"}
                        icon={Icon.AppWindow}
                        detail={
                            <List.Item.Detail
                                metadata={
                                    <List.Item.Detail.Metadata>
                                        <List.Item.Detail.Metadata.Label title="Vendor" text={g.vendor || "-"} />
                                        <List.Item.Detail.Metadata.Label title="Driver" text={g.driver || "-"} />
                                        <List.Item.Detail.Metadata.Label title="Type" text={g.type || "-"} />
                                    </List.Item.Detail.Metadata>
                                }
                            />
                        }
                    />
                ))}

                <List.Item
                    title="Memory"
                    subtitle="RAM"
                    icon={Icon.CircleProgress}
                    detail={
                        <List.Item.Detail
                            metadata={
                                <List.Item.Detail.Metadata>
                                    <List.Item.Detail.Metadata.Label title="Used" text={bytesToHuman(mem?.used)} />
                                    <List.Item.Detail.Metadata.Label title="Total" text={bytesToHuman(mem?.total)} />
                                </List.Item.Detail.Metadata>
                            }
                        />
                    }
                />

                {disks.map((d, i) => (
                    <List.Item
                        key={`disk-${i}-${d.mountpoint}-${d.filesystem}`}
                        title={d.name || d.mountpoint || "Disk"}
                        subtitle={d.mountpoint || "Filesystem"}
                        icon={Icon.Folder}
                        detail={
                            <List.Item.Detail
                                metadata={
                                    <List.Item.Detail.Metadata>
                                        <List.Item.Detail.Metadata.Label title="Filesystem" text={d.filesystem || "-"} />
                                        <List.Item.Detail.Metadata.Label title="Used" text={bytesToHuman(d.bytes?.used)} />
                                        <List.Item.Detail.Metadata.Label title="Total" text={bytesToHuman(d.bytes?.total)} />
                                        <List.Item.Detail.Metadata.Label title="Available" text={bytesToHuman(d.bytes?.available)} />
                                    </List.Item.Detail.Metadata>
                                }
                            />
                        }
                    />
                ))}

                {batteries.map((b, i) => (
                    <List.Item
                        key={`bat-${i}-${b.modelName}`}
                        title={b.modelName || "Battery"}
                        subtitle={b.status || "Battery"}
                        icon={{ source: Icon.Battery, tintColor: (b.status || "").includes("Dis") ? Color.Orange : Color.Green }}
                        detail={
                            <List.Item.Detail
                                metadata={
                                    <List.Item.Detail.Metadata>
                                        <List.Item.Detail.Metadata.Label title="Status" text={b.status || "-"} />
                                        <List.Item.Detail.Metadata.Label title="Capacity" text={`${Math.round(b.capacity ?? 0)}%`} />
                                    </List.Item.Detail.Metadata>
                                }
                            />
                        }
                    />
                ))}
            </List.Section>

            <List.Section title="Software">
                <List.Item
                    title="Desktop / Window Manager"
                    subtitle={`${de?.prettyName || "-"} • ${wm?.prettyName || "-"}`}
                    icon={Icon.AppWindow}
                    detail={
                        <List.Item.Detail
                            metadata={
                                <List.Item.Detail.Metadata>
                                    <List.Item.Detail.Metadata.Label title="Desktop Environment" text={de?.prettyName || "-"} />
                                    <List.Item.Detail.Metadata.Label title="Version" text={de?.version || "-"} />
                                    <List.Item.Detail.Metadata.Separator />
                                    <List.Item.Detail.Metadata.Label title="Window Manager" text={wm?.prettyName || "-"} />
                                    <List.Item.Detail.Metadata.Label title="Protocol" text={wm?.protocolName || "-"} />
                                </List.Item.Detail.Metadata>
                            }
                        />
                    }
                />

                <List.Item
                    title="Shell"
                    subtitle={shell?.prettyName || "Shell"}
                    icon={Icon.Terminal}
                    detail={<List.Item.Detail metadata={<List.Item.Detail.Metadata>
                        <List.Item.Detail.Metadata.Label title="Shell" text={shell?.prettyName || "-"} />
                        <List.Item.Detail.Metadata.Label title="Version" text={shell?.version || "-"} />
                    </List.Item.Detail.Metadata>} />}
                />

                <List.Item
                    title="Packages"
                    subtitle={`${pkgs?.all ?? 0} total`}
                    icon={Icon.Box}
                    detail={<List.Item.Detail metadata={<List.Item.Detail.Metadata>
                        <List.Item.Detail.Metadata.Label title="Total" text={String(pkgs?.all ?? "-")} />
                        <List.Item.Detail.Metadata.Label title="Pacman" text={String(pkgs?.pacman ?? "-")} />
                        <List.Item.Detail.Metadata.Label title="Flatpak (system)" text={String(pkgs?.flatpakSystem ?? "-")} />
                        <List.Item.Detail.Metadata.Label title="Flatpak (user)" text={String(pkgs?.flatpakUser ?? "-")} />
                    </List.Item.Detail.Metadata>} />}
                />

                {nets.map((n, i) => (
                    <List.Item
                        key={`net-${i}-${n.name}`}
                        title={`Network ${n.name || i}`}
                        subtitle={n.ipv4 || "Network"}
                        icon={Icon.Network}
                        detail={<List.Item.Detail metadata={<List.Item.Detail.Metadata>
                            <List.Item.Detail.Metadata.Label title="Interface" text={n.name || "-"} />
                            <List.Item.Detail.Metadata.Label title="IPv4" text={n.ipv4 || "-"} />
                        </List.Item.Detail.Metadata>} />}
                    />
                ))}
            </List.Section>
        </List>
    );
}
