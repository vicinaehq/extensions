import { readFile } from "node:fs/promises";
import { SCHEMA_VERSION } from "../domain/model";
import type { ReminderPaths } from "../platform/paths";
import { resolveReminderPaths } from "../platform/paths";
import { ReminderStore } from "../storage/store";
import {
	type CommandRunner,
	findLoginctl,
	findSystemctl,
	INFRASTRUCTURE_VERSION,
	type InfrastructureManifest,
	notificationCapabilities,
	runCommand,
	WORKER_VERSION,
} from "./infrastructure";
import { SERVICE_NAME, TIMER_NAME } from "./units";

export type Diagnostics = {
	extensionVersion: string;
	workerVersion: string;
	infrastructureVersion: number;
	schemaVersion: number;
	dataDir: string;
	stateDir: string;
	nodePath: string;
	notifySendPath: string;
	systemctlPath: string;
	notificationService: string;
	notificationActions: string;
	linger: string;
	timerInstalled: boolean;
	timerEnabled: string;
	timerActive: string;
	nextActivation: string;
	serviceResult: string;
	lastWorkerRun: string;
	lastWorkerError: string;
	validReminders: number;
	corruptReminders: number;
	pendingNotifications: number;
};

async function readJson<T>(filePath: string): Promise<T | undefined> {
	try {
		return JSON.parse(await readFile(filePath, "utf8"));
	} catch {
		return undefined;
	}
}

async function safeCommand(runner: CommandRunner, file: string, args: string[]): Promise<string> {
	try {
		return (await runner(file, args)).stdout.trim();
	} catch (error) {
		const candidate = error as { stdout?: string; stderr?: string; message?: string };
		return (candidate.stdout || candidate.stderr || candidate.message || "unavailable").trim();
	}
}

function parseProperties(value: string): Record<string, string> {
	return Object.fromEntries(
		value
			.split("\n")
			.map((line) => line.split("=", 2))
			.filter((parts) => parts.length === 2),
	);
}

export async function collectDiagnostics(
	paths: ReminderPaths = resolveReminderPaths(),
	runner: CommandRunner = runCommand,
): Promise<Diagnostics> {
	const store = new ReminderStore(paths);
	const [scan, manifest, status] = await Promise.all([
		store.list(),
		readJson<InfrastructureManifest>(paths.infrastructureManifestPath),
		readJson<Record<string, unknown>>(paths.workerStatusPath),
	]);
	const systemctlPath =
		manifest?.systemctlPath ??
		(await findSystemctl(process.env, runner).catch(() => "systemctl unavailable"));
	const loginctlPath = await findLoginctl(process.env, runner).catch(() => undefined);
	const [timerProperties, serviceProperties, liveCapabilities, linger] = await Promise.all([
		safeCommand(runner, systemctlPath, [
			"--user",
			"show",
			TIMER_NAME,
			"--property=LoadState,UnitFileState,ActiveState,NextElapseUSecRealtime",
		]),
		safeCommand(runner, systemctlPath, [
			"--user",
			"show",
			SERVICE_NAME,
			"--property=Result,ExecMainStatus,ExecMainExitTimestamp",
		]),
		manifest?.busctlPath
			? notificationCapabilities(manifest.busctlPath, runner).catch(() => undefined)
			: Promise.resolve(undefined),
		loginctlPath
			? safeCommand(runner, loginctlPath, [
					"show-user",
					process.env.USER ?? String(typeof process.getuid === "function" ? process.getuid() : ""),
					"--property=Linger",
					"--value",
				])
			: Promise.resolve("unavailable"),
	]);
	const timer = parseProperties(timerProperties);
	const service = parseProperties(serviceProperties);
	const reminderError = scan.reminders
		.filter((reminder) => reminder.lastError)
		.sort(
			(a, b) => Date.parse(b.lastAttemptAt ?? "") - Date.parse(a.lastAttemptAt ?? ""),
		)[0]?.lastError;
	return {
		extensionVersion: "1.5.0",
		workerVersion: manifest?.workerVersion ?? WORKER_VERSION,
		infrastructureVersion: manifest?.infrastructureVersion ?? INFRASTRUCTURE_VERSION,
		schemaVersion: manifest?.schemaVersion ?? SCHEMA_VERSION,
		dataDir: paths.dataDir,
		stateDir: paths.stateDir,
		nodePath: manifest?.nodePath ?? "Not installed",
		notifySendPath: manifest?.notifySendPath ?? "Not installed",
		systemctlPath,
		notificationService: liveCapabilities ? "Available" : "Unavailable",
		notificationActions: liveCapabilities?.includes("actions") ? "Supported" : "Unavailable",
		linger: linger || "unknown",
		timerInstalled: timer.LoadState === "loaded",
		timerEnabled: timer.UnitFileState ?? "unknown",
		timerActive: timer.ActiveState ?? "unknown",
		nextActivation: timer.NextElapseUSecRealtime || "unknown",
		serviceResult:
			[service.Result, service.ExecMainStatus].filter(Boolean).join(" (exit ") +
				(service.ExecMainStatus ? ")" : "") || "unknown",
		lastWorkerRun: String(status?.finishedAt ?? "Never"),
		lastWorkerError: String(
			status?.error ??
				(Array.isArray(status?.outcomes)
					? (status.outcomes as { status?: string; error?: string }[]).find(
							(item) => item.status === "failed",
						)?.error
					: undefined) ??
				reminderError ??
				"None",
		),
		validReminders: scan.reminders.length,
		corruptReminders: scan.corrupt.length,
		pendingNotifications: scan.reminders.filter((reminder) => reminder.pendingNotification).length,
	};
}

function mdEscape(value: unknown): string {
	return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function diagnosticsMarkdown(diagnostics: Diagnostics): string {
	const rows: [string, unknown][] = [
		["Extension", diagnostics.extensionVersion],
		["Worker", diagnostics.workerVersion],
		["Infrastructure", diagnostics.infrastructureVersion],
		["Schema", diagnostics.schemaVersion],
		["Data", diagnostics.dataDir],
		["State", diagnostics.stateDir],
		["Node", diagnostics.nodePath],
		["notify-send", diagnostics.notifySendPath],
		["systemctl", diagnostics.systemctlPath],
		["Notification service", diagnostics.notificationService],
		["Notification actions", diagnostics.notificationActions],
		["User lingering", diagnostics.linger],
		["Timer installed", diagnostics.timerInstalled ? "Yes" : "No"],
		["Timer enabled", diagnostics.timerEnabled],
		["Timer active", diagnostics.timerActive],
		["Next activation", diagnostics.nextActivation],
		["Last service result", diagnostics.serviceResult],
		["Last worker run", diagnostics.lastWorkerRun],
		["Last worker error", diagnostics.lastWorkerError],
		["Valid reminders", diagnostics.validReminders],
		["Corrupt reminders", diagnostics.corruptReminders],
		["Notifications awaiting action", diagnostics.pendingNotifications],
	];
	return `# Reminder diagnostics\n\n| Check | Value |\n| --- | --- |\n${rows
		.map(([label, value]) => `| ${mdEscape(label)} | ${mdEscape(value)} |`)
		.join("\n")}\n\nReminder data is preserved when infrastructure is removed.`;
}
