import { Action, ActionPanel, List, Toast, showToast } from "@vicinae/api";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { useCallback, useEffect, useState } from "react";

type ItemKind = "vpn" | "wifi" | "setting";

type NmItem = {
	id: string;
	kind: ItemKind;
	title: string;
	subtitle: string;
	detail: string;
	icon: string;
	isActive?: boolean;
	usageKey?: string;
	onAction: () => void;
};

type WifiEntry = {
	ssid: string;
	signal: number;
	security: string;
	rate: string;
	inUse: boolean;
};

const RESCAN_INTERVAL_SECONDS = 120;
const USAGE_DB = join(
	homedir(),
	".cache",
	"vicinae-network-manager",
	"usage.json",
);
let lastWifiScanAt = 0;

function runNmcli(args: string[]): string {
	return execFileSync("nmcli", args, { encoding: "utf8" }).trim();
}

function runNmcliSafe(args: string[]): string {
	try {
		return runNmcli(args);
	} catch {
		return "";
	}
}

function parseTerseLine(line: string): string[] {
	const parts: string[] = [];
	let current = "";
	let escaped = false;
	for (const char of line) {
		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}
		if (char === "\\") {
			escaped = true;
			continue;
		}
		if (char === ":") {
			parts.push(current);
			current = "";
			continue;
		}
		current += char;
	}
	parts.push(current);
	return parts;
}

function ensureUsageDbDir() {
	mkdirSync(dirname(USAGE_DB), { recursive: true });
}

function loadUsage(): Record<string, number> {
	try {
		return JSON.parse(readFileSync(USAGE_DB, "utf8")) as Record<string, number>;
	} catch {
		return {};
	}
}

function addUsage(usageKey: string) {
	const usage = loadUsage();
	usage[usageKey] = (usage[usageKey] ?? 0) + 1;
	ensureUsageDbDir();
	writeFileSync(USAGE_DB, JSON.stringify(usage, null, 2));
}

function getActiveConnectionNames(): Set<string> {
	const raw = runNmcliSafe([
		"-t",
		"-f",
		"NAME",
		"connection",
		"show",
		"--active",
	]);
	return new Set(
		raw
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean),
	);
}

function vpnServiceType(connectionName: string): string {
	const raw = runNmcliSafe([
		"-g",
		"vpn.service-type",
		"connection",
		"show",
		connectionName,
	]);
	if (!raw) return "vpn";
	const parts = raw.split(".");
	return parts[parts.length - 1] || "vpn";
}

function wifiIcon(signal: number): string {
	if (signal > 70) return "📶";
	if (signal > 30) return "📡";
	return "📳";
}

function listVpns(): NmItem[] {
	const raw = runNmcliSafe(["-t", "-f", "NAME,TYPE", "connection", "show"]);
	const activeConnections = getActiveConnectionNames();
	const vpns = raw
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => parseTerseLine(line))
		.filter(
			(parts) => parts.length >= 2 && parts[1].toLowerCase().includes("vpn"),
		);

	return vpns.map((parts) => {
		const name = parts[0];
		const serviceType = vpnServiceType(name);
		const active = activeConnections.has(name);
		const usageKey = `vpn:${name}`;
		return {
			id: usageKey,
			kind: "vpn",
			title: name,
			subtitle: `${serviceType} • ${active ? "active" : "inactive"}`,
			detail: [
				`# ${name}`,
				`- Type: ${serviceType}`,
				`- State: ${active ? "active" : "inactive"}`,
				"",
				`Action: ${active ? "disconnect" : "connect"}`,
			].join("\n"),
			icon: "🔐",
			isActive: active,
			usageKey,
			onAction: () => {
				if (active) {
					runNmcli(["connection", "down", "id", name]);
					showToast({
						style: Toast.Style.Success,
						title: `Disconnected: ${name}`,
					});
					return;
				}
				runNmcli(["connection", "up", "id", name]);
				addUsage(usageKey);
				showToast({ style: Toast.Style.Success, title: `Connected: ${name}` });
			},
		} satisfies NmItem;
	});
}

function maybeRescanWifi() {
	const now = Math.floor(Date.now() / 1000);
	if (now - lastWifiScanAt <= RESCAN_INTERVAL_SECONDS) return;
	runNmcliSafe(["device", "wifi", "rescan"]);
	lastWifiScanAt = now;
}

function listWifi(): NmItem[] {
	maybeRescanWifi();
	const activeConnections = getActiveConnectionNames();
	const raw = runNmcliSafe([
		"-t",
		"-f",
		"IN-USE,SSID,SIGNAL,SECURITY,RATE",
		"device",
		"wifi",
		"list",
	]);
	const bySsid = new Map<string, WifiEntry>();

	for (const line of raw
		.split("\n")
		.map((x) => x.trim())
		.filter(Boolean)) {
		const parts = parseTerseLine(line);
		if (parts.length < 5) continue;
		const inUse = parts[0] === "*";
		const ssid = parts[1].trim();
		if (!ssid) continue;
		const signal = Number.parseInt(parts[2] || "0", 10) || 0;
		const security = parts[3] || "open";
		const rate = parts[4] || "unknown";
		const prev = bySsid.get(ssid);
		if (!prev || signal > prev.signal) {
			bySsid.set(ssid, { ssid, signal, security, rate, inUse });
		}
	}

	return Array.from(bySsid.values()).map((wifi) => {
		const usageKey = `wifi:${wifi.ssid}`;
		const active = wifi.inUse || activeConnections.has(wifi.ssid);
		return {
			id: usageKey,
			kind: "wifi",
			title: wifi.ssid,
			subtitle: `${wifi.signal}% • ${wifi.security} • ${active ? "connected" : "available"}`,
			detail: [
				`# ${wifi.ssid}`,
				`- Signal: ${wifi.signal}%`,
				`- Security: ${wifi.security}`,
				`- Rate: ${wifi.rate}`,
				`- State: ${active ? "connected" : "disconnected"}`,
				"",
				`Action: ${active ? "disconnect" : "connect"}`,
			].join("\n"),
			icon: wifiIcon(wifi.signal),
			isActive: active,
			usageKey,
			onAction: () => {
				if (active) {
					runNmcliSafe(["connection", "down", "id", wifi.ssid]);
					showToast({
						style: Toast.Style.Success,
						title: `Disconnected: ${wifi.ssid}`,
					});
					return;
				}
				runNmcli(["device", "wifi", "connect", wifi.ssid]);
				addUsage(usageKey);
				showToast({
					style: Toast.Style.Success,
					title: `Connected: ${wifi.ssid}`,
				});
			},
		} satisfies NmItem;
	});
}

function wifiEnabled(): boolean {
	return runNmcliSafe(["radio", "wifi"]) === "enabled";
}

function networkingEnabled(): boolean {
	return runNmcliSafe(["networking"]) === "enabled";
}

function listSettings(): NmItem[] {
	const wifiOn = wifiEnabled();
	const netOn = networkingEnabled();

	return [
		{
			id: "settings:wifi",
			kind: "setting",
			title: wifiOn ? "Disable Wi-Fi" : "Enable Wi-Fi",
			subtitle: `Wi-Fi is currently ${wifiOn ? "enabled" : "disabled"}`,
			detail: `# Wi-Fi adapter\nCurrent state: ${wifiOn ? "enabled" : "disabled"}`,
			icon: wifiOn ? "📴" : "📶",
			onAction: () => {
				runNmcli(["radio", "wifi", wifiOn ? "off" : "on"]);
				showToast({
					style: Toast.Style.Success,
					title: wifiOn ? "Wi-Fi disabled" : "Wi-Fi enabled",
				});
			},
		},
		{
			id: "settings:networking",
			kind: "setting",
			title: netOn ? "Disable networking" : "Enable networking",
			subtitle: `Network stack is ${netOn ? "enabled" : "disabled"}`,
			detail: `# Networking\nCurrent state: ${netOn ? "enabled" : "disabled"}`,
			icon: netOn ? "⛔" : "🌐",
			onAction: () => {
				runNmcli(["networking", netOn ? "off" : "on"]);
				showToast({
					style: Toast.Style.Success,
					title: netOn ? "Networking disabled" : "Networking enabled",
				});
			},
		},
		{
			id: "settings:rescan",
			kind: "setting",
			title: "Rescan Wi-Fi networks",
			subtitle: "Trigger immediate scan for nearby access points",
			detail: "# Wi-Fi scan\nRuns `nmcli device wifi rescan` immediately.",
			icon: "🔄",
			onAction: () => {
				runNmcli(["device", "wifi", "rescan"]);
				lastWifiScanAt = Math.floor(Date.now() / 1000);
				showToast({
					style: Toast.Style.Success,
					title: "Wi-Fi rescan completed",
				});
			},
		},
	];
}

function sortByUsage(items: NmItem[]): NmItem[] {
	const usage = loadUsage();
	return [...items].sort((a, b) => {
		const aScore = a.usageKey ? (usage[a.usageKey] ?? 0) : 0;
		const bScore = b.usageKey ? (usage[b.usageKey] ?? 0) : 0;
		return bScore - aScore;
	});
}

function buildItems(): { vpns: NmItem[]; wifi: NmItem[]; settings: NmItem[] } {
	return {
		vpns: sortByUsage(listVpns()),
		wifi: sortByUsage(listWifi()),
		settings: listSettings(),
	};
}

function toListItem(item: NmItem, onActionDone: () => void) {
	return (
		<List.Item
			key={item.id}
			title={item.title}
			subtitle={item.subtitle}
			icon={item.icon}
			keywords={[item.kind, item.subtitle]}
			detail={<List.Item.Detail markdown={item.detail} />}
			actions={
				<ActionPanel>
					<Action
						title={item.isActive ? "Disconnect" : "Execute"}
						onAction={() => {
							try {
								item.onAction();
								onActionDone();
							} catch (error) {
								const message =
									error instanceof Error
										? error.message
										: "Unknown command error";
								showToast({
									style: Toast.Style.Failure,
									title: "nmcli failed",
									message,
								});
							}
						}}
					/>
				</ActionPanel>
			}
		/>
	);
}

function nmcliAvailable(): boolean {
	try {
		execFileSync("which", ["nmcli"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

export default function NetworkManagerCommand() {
	const [items, setItems] = useState<{
		vpns: NmItem[];
		wifi: NmItem[];
		settings: NmItem[];
	}>(() => buildItems());

	const reloadItems = useCallback(() => {
		setItems(buildItems());
	}, []);

	useEffect(() => {
		reloadItems();
	}, [reloadItems]);

	const refreshAfterAction = useCallback(() => {
		// NetworkManager updates some states asynchronously; refresh twice.
		reloadItems();
		setTimeout(() => {
			reloadItems();
		}, 1200);
	}, [reloadItems]);

	if (!nmcliAvailable()) {
		return (
			<List>
				<List.Item
					title="nmcli is not installed"
					subtitle="Install NetworkManager CLI and retry"
					icon="⚠️"
					detail={
						<List.Item.Detail
							markdown={
								"# Missing dependency\nThis extension requires `nmcli` in `$PATH`."
							}
						/>
					}
				/>
			</List>
		);
	}

	const { vpns, wifi, settings } = items;
	return (
		<List
			isShowingDetail
			searchBarPlaceholder="Search VPN, Wi-Fi and settings..."
		>
			<List.Section title="Wi-Fi">
				{wifi.map((item) => toListItem(item, refreshAfterAction))}
			</List.Section>
			<List.Section title="VPN">
				{vpns.map((item) => toListItem(item, refreshAfterAction))}
			</List.Section>
			<List.Section title="Settings">
				{settings.map((item) => toListItem(item, refreshAfterAction))}
			</List.Section>
		</List>
	);
}
