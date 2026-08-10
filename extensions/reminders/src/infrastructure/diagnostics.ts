import { readFile } from "node:fs/promises";
import { SCHEMA_VERSION } from "../domain/model";
import type { ReminderPaths } from "../platform/paths";
import { resolveReminderPaths } from "../platform/paths";
import { ReminderStore } from "../storage/store";
import {
	type CommandRunner,
	findSystemctl,
	INFRASTRUCTURE_VERSION,
	type InfrastructureManifest,
	notificationCapabilities,
	runCommand,
	WORKER_VERSION,
} from "./infrastructure";

export type Diagnostics = {
	extensionVersion: string;
	workerVersion: string;
	infrastructureVersion: number;
	schemaVersion: number;
	scheduler: string;
	dataDir: string;
	stateDir: string;
	workerSourcePath: string;
	nodePath: string;
	notifySendPath: string;
	systemctlPath: string;
	systemdRunPath: string;
	notificationService: string;
	notificationActions: string;
	activeNotificationHelpers: number;
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
	} catch {
		return "";
	}
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
	const [helperUnits, liveCapabilities] = await Promise.all([
		safeCommand(runner, systemctlPath, [
			"--user",
			"list-units",
			"--state=active",
			"--plain",
			"--no-legend",
			"vicinae-reminder-notification-*.service",
		]),
		manifest?.busctlPath
			? notificationCapabilities(manifest.busctlPath, runner).catch(() => undefined)
			: Promise.resolve(undefined),
	]);
	const reminderError = scan.reminders
		.filter((reminder) => reminder.lastError)
		.sort(
			(a, b) => Date.parse(b.lastAttemptAt ?? "") - Date.parse(a.lastAttemptAt ?? ""),
		)[0]?.lastError;
	return {
		extensionVersion: "1.6.0",
		workerVersion: manifest?.workerVersion ?? WORKER_VERSION,
		infrastructureVersion: manifest?.infrastructureVersion ?? INFRASTRUCTURE_VERSION,
		schemaVersion: manifest?.schemaVersion ?? SCHEMA_VERSION,
		scheduler: "Vicinae interval (1 minute)",
		dataDir: paths.dataDir,
		stateDir: paths.stateDir,
		workerSourcePath: manifest?.workerSourcePath ?? "Not initialised",
		nodePath: manifest?.nodePath ?? "Not initialised",
		notifySendPath: manifest?.notifySendPath ?? "Not initialised",
		systemctlPath,
		systemdRunPath: manifest?.systemdRunPath ?? "Not initialised",
		notificationService: liveCapabilities ? "Available" : "Unavailable",
		notificationActions: liveCapabilities?.includes("actions") ? "Supported" : "Unavailable",
		activeNotificationHelpers: helperUnits
			.split("\n")
			.filter((line) => /^vicinae-reminder-notification-\S+\.service\s/.test(line)).length,
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
		["Scheduler", diagnostics.scheduler],
		["Data", diagnostics.dataDir],
		["State", diagnostics.stateDir],
		["Worker source", diagnostics.workerSourcePath],
		["Node", diagnostics.nodePath],
		["notify-send", diagnostics.notifySendPath],
		["systemctl", diagnostics.systemctlPath],
		["systemd-run", diagnostics.systemdRunPath],
		["Notification service", diagnostics.notificationService],
		["Notification actions", diagnostics.notificationActions],
		["Active notification helpers", diagnostics.activeNotificationHelpers],
		["Last reminder check", diagnostics.lastWorkerRun],
		["Last check error", diagnostics.lastWorkerError],
		["Valid reminders", diagnostics.validReminders],
		["Corrupt reminders", diagnostics.corruptReminders],
		["Notifications awaiting action", diagnostics.pendingNotifications],
	];
	return `# Reminder diagnostics\n\n| Check | Value |\n| --- | --- |\n${rows
		.map(([label, value]) => `| ${mdEscape(label)} | ${mdEscape(value)} |`)
		.join("\n")}`;
}
