import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { newReminder } from "../src/domain/model";
import { INFRASTRUCTURE_VERSION, WORKER_VERSION } from "../src/infrastructure/infrastructure";
import { reminderPathsFromDirectories } from "../src/platform/paths";
import { atomicWriteFile, atomicWriteJson } from "../src/storage/atomic";
import { ReminderStore } from "../src/storage/store";

const run = promisify(execFile);

async function main(): Promise<void> {
	const systemctl = process.env.VICINAE_REMINDERS_SYSTEMCTL ?? "systemctl";
	const systemdRun = process.env.VICINAE_REMINDERS_SYSTEMD_RUN ?? "systemd-run";
	const busctl = process.env.VICINAE_REMINDERS_BUSCTL ?? "busctl";
	const root = await mkdtemp(path.join(os.tmpdir(), "vicinae-reminders-action-check-"));
	let reminderId = "";
	try {
		const workerPath = path.resolve("assets/worker.cjs");
		const workerBytes = await readFile(workerPath);
		const notificationIconBytes = await readFile(path.resolve("assets/icon.png"));
		const paths = reminderPathsFromDirectories(path.join(root, "data"), path.join(root, "state"));
		const store = new ReminderStore(paths);
		await store.ensureDirectories();
		await atomicWriteFile(paths.workerPath, workerBytes, 0o755);
		await atomicWriteFile(paths.notificationIconPath, notificationIconBytes, 0o644);
		const due = new Date(Date.now() - 1_000);
		const reminder = newReminder(
			"Transient helper integration check",
			due,
			new Date(due.getTime() - 60_000),
		);
		reminderId = reminder.id;
		await store.create(reminder);
		const capturePath = path.join(root, "notify-args.json");
		const notifierPath = path.join(root, "fake-notify.mjs");
		await writeFile(
			notifierPath,
			`#!/usr/bin/env node\nimport { existsSync, readFileSync, writeFileSync } from "node:fs";\nconst path = ${JSON.stringify(capturePath)};\nconst calls = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];\nconst args = process.argv.slice(2);\ncalls.push(args);\nwriteFileSync(path, JSON.stringify(calls));\nprocess.stdout.write(args.includes("--action=snooze-menu=Snooze...") ? "snooze-menu\\n" : "snooze-10m\\n");\n`,
		);
		await chmod(notifierPath, 0o755);
		await atomicWriteJson(paths.infrastructureManifestPath, {
			infrastructureVersion: INFRASTRUCTURE_VERSION,
			workerVersion: WORKER_VERSION,
			schemaVersion: reminder.schemaVersion,
			workerSha256: createHash("sha256").update(workerBytes).digest("hex"),
			notificationIconSha256: createHash("sha256").update(notificationIconBytes).digest("hex"),
			nodePath: process.execPath,
			notifySendPath: notifierPath,
			systemctlPath: systemctl,
			systemdRunPath: systemdRun,
			busctlPath: busctl,
			notificationCapabilities: ["actions"],
			installedAt: new Date().toISOString(),
		});
		await run(
			process.execPath,
			[
				workerPath,
				"--data-dir",
				paths.dataDir,
				"--state-dir",
				paths.stateDir,
				"--notify-send",
				notifierPath,
				"--icon",
				paths.notificationIconPath,
			],
			{ timeout: 15_000 },
		);

		let snoozed = await store.get(reminder.id);
		for (let attempt = 0; attempt < 100 && snoozed?.pendingNotification; attempt += 1) {
			await delay(50);
			snoozed = await store.get(reminder.id);
		}
		if (!snoozed) throw new Error("Snooze unexpectedly deleted the reminder");
		if (snoozed.pendingNotification)
			throw new Error("Transient notification helper did not finish");
		if (Date.parse(snoozed.dueAt) < Date.now() + 8 * 60_000) {
			throw new Error("Snooze did not move the reminder ten minutes ahead");
		}
		const calls = JSON.parse(await readFile(capturePath, "utf8")) as string[][];
		const args = calls.flat();
		if (
			!args.includes("--wait") ||
			args.includes("--action=default=Complete") ||
			!args.includes("--action=complete=Complete") ||
			!args.includes("--action=snooze-menu=Snooze...") ||
			!args.includes("--action=snooze-10m=10 minutes") ||
			!args.includes("--action=snooze-1h=1 hour") ||
			!args.includes("--action=snooze-tomorrow=Tomorrow at 09:00")
		) {
			throw new Error("Actionable notification arguments were missing");
		}
		process.stdout.write("Verified real transient systemd helper and Snooze storage lifecycle\n");
	} finally {
		if (reminderId) {
			await run(
				systemctl,
				["--user", "stop", `vicinae-reminder-notification-${reminderId}-*.service`],
				{ timeout: 10_000 },
			).catch(() => undefined);
		}
		await rm(root, { recursive: true, force: true });
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
