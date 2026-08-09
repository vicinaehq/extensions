import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { SCHEMA_VERSION } from "./domain/model";
import {
	INFRASTRUCTURE_VERSION,
	type InfrastructureManifest,
	WORKER_VERSION,
} from "./infrastructure/infrastructure";
import { reminderPathsFromDirectories, resolveReminderPaths } from "./platform/paths";
import { atomicWriteJson } from "./storage/atomic";
import { ReminderStore } from "./storage/store";
import { runNotificationHelper } from "./worker/notification-actions";
import { SystemdNotificationDispatcher } from "./worker/notification-dispatcher";
import { NotifySendNotifier } from "./worker/notifier";
import { processDueReminders } from "./worker/processor";

function argumentValue(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
	if (process.argv.includes("--version")) {
		process.stdout.write(`vicinae-reminders-worker ${WORKER_VERSION}\n`);
		return;
	}
	const defaults = resolveReminderPaths();
	const dataDir = argumentValue("--data-dir") ?? defaults.dataDir;
	const stateDir = argumentValue("--state-dir") ?? defaults.stateDir;
	const notifySendArgument = argumentValue("--notify-send");
	const paths = reminderPathsFromDirectories(dataDir, stateDir);
	const notificationIcon = argumentValue("--icon") ?? paths.notificationIconPath;
	const store = new ReminderStore(paths);
	await store.ensureDirectories();

	let manifest: InfrastructureManifest;
	try {
		manifest = JSON.parse(await readFile(paths.infrastructureManifestPath, "utf8"));
		if (
			manifest.infrastructureVersion !== INFRASTRUCTURE_VERSION ||
			manifest.workerVersion !== WORKER_VERSION ||
			manifest.schemaVersion !== SCHEMA_VERSION
		) {
			throw new Error("Installed infrastructure metadata is incompatible with this worker");
		}
		const runningWorkerHash = createHash("sha256")
			.update(await readFile(process.argv[1]))
			.digest("hex");
		if (runningWorkerHash !== manifest.workerSha256) {
			throw new Error("Installed worker fingerprint does not match infrastructure metadata");
		}
		const notificationIconHash = createHash("sha256")
			.update(await readFile(paths.notificationIconPath))
			.digest("hex");
		if (notificationIconHash !== manifest.notificationIconSha256) {
			throw new Error(
				"Installed notification icon fingerprint does not match infrastructure metadata",
			);
		}
	} catch (error) {
		await atomicWriteJson(paths.workerStatusPath, {
			workerVersion: WORKER_VERSION,
			finishedAt: new Date().toISOString(),
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
	const notifySend = notifySendArgument ?? manifest.notifySendPath;

	if (process.argv.includes("--notification-helper")) {
		const reminderId = argumentValue("--reminder-id");
		const token = argumentValue("--token");
		if (!reminderId || !token)
			throw new Error("Notification helper requires reminder id and token");
		await runNotificationHelper(
			store,
			new NotifySendNotifier(notifySend, undefined, notificationIcon),
			reminderId,
			token,
		);
		return;
	}

	try {
		const result = await processDueReminders(
			store,
			new SystemdNotificationDispatcher(paths, manifest),
		);
		await atomicWriteJson(paths.workerStatusPath, {
			workerVersion: WORKER_VERSION,
			ok: result.failedCount === 0,
			error: result.outcomes.find((item) => item.status === "failed")?.error,
			...result,
		});
		if (result.failedCount > 0) process.exitCode = 1;
	} catch (error) {
		await atomicWriteJson(paths.workerStatusPath, {
			workerVersion: WORKER_VERSION,
			finishedAt: new Date().toISOString(),
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
