import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { newReminder } from "../src/domain/model";
import { INFRASTRUCTURE_VERSION, WORKER_VERSION } from "../src/infrastructure/infrastructure";
import { reminderPathsFromDirectories } from "../src/platform/paths";
import { atomicWriteJson } from "../src/storage/atomic";
import { ReminderStore } from "../src/storage/store";

const run = promisify(execFile);

async function main(): Promise<void> {
	const systemctl = process.env.VICINAE_REMINDERS_SYSTEMCTL ?? "systemctl";
	const systemdRun = process.env.VICINAE_REMINDERS_SYSTEMD_RUN ?? "systemd-run";
	const busctl = process.env.VICINAE_REMINDERS_BUSCTL ?? "busctl";
	const root = await mkdtemp(path.join(os.tmpdir(), "vicinae-reminders-worker-check-"));
	try {
		const workerPath = path.resolve("assets/worker.cjs");
		const workerBytes = await readFile(workerPath);
		const notificationIconBytes = await readFile(path.resolve("assets/icon.png"));
		const paths = reminderPathsFromDirectories(path.join(root, "data"), path.join(root, "state"));
		const store = new ReminderStore(paths);
		await store.ensureDirectories();
		await writeFile(paths.notificationIconPath, notificationIconBytes);
		const reminder = newReminder(
			`literal $(touch ${path.join(root, "pwned")}) text`,
			new Date(Date.now() - 1_000),
		);
		await store.create(reminder);
		const token = randomUUID();
		await store.mutate(reminder.id, reminder.revision, (current) => ({
			...current,
			pendingNotification: {
				token,
				claimedAt: new Date().toISOString(),
				unitName: `vicinae-reminder-notification-${reminder.id}-${token}.service`,
			},
		}));
		await atomicWriteJson(paths.infrastructureManifestPath, {
			infrastructureVersion: INFRASTRUCTURE_VERSION,
			workerVersion: WORKER_VERSION,
			schemaVersion: reminder.schemaVersion,
			workerSha256: createHash("sha256").update(workerBytes).digest("hex"),
			notificationIconSha256: createHash("sha256").update(notificationIconBytes).digest("hex"),
			nodePath: process.execPath,
			notifySendPath: path.join(root, "fake-notify.mjs"),
			systemctlPath: systemctl,
			systemdRunPath: systemdRun,
			busctlPath: busctl,
			notificationCapabilities: ["actions"],
			installedAt: new Date().toISOString(),
		});
		const capturePath = path.join(root, "captured.json");
		const notifierPath = path.join(root, "fake-notify.mjs");
		await writeFile(
			notifierPath,
			`#!/usr/bin/env node\nimport { writeFileSync } from "node:fs";\nwriteFileSync(process.env.REMINDER_CAPTURE, JSON.stringify(process.argv.slice(2)));\nprocess.stdout.write("complete\\n");\n`,
		);
		await chmod(notifierPath, 0o755);
		await run(
			process.execPath,
			[
				workerPath,
				"--notification-helper",
				"--reminder-id",
				reminder.id,
				"--token",
				token,
				"--data-dir",
				paths.dataDir,
				"--state-dir",
				paths.stateDir,
				"--notify-send",
				notifierPath,
				"--icon",
				paths.notificationIconPath,
			],
			{ env: { ...process.env, REMINDER_CAPTURE: capturePath }, timeout: 15_000 },
		);
		const captured = JSON.parse(await readFile(capturePath, "utf8")) as string[];
		if (captured.at(-1) !== reminder.text) throw new Error("Worker did not preserve reminder text");
		if (await store.get(reminder.id))
			throw new Error("Worker did not complete the delivered reminder");
		await atomicWriteJson(paths.infrastructureManifestPath, {
			infrastructureVersion: INFRASTRUCTURE_VERSION,
			workerVersion: WORKER_VERSION,
			schemaVersion: reminder.schemaVersion,
			workerSha256: "stale-worker-fingerprint",
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
				"--notification-helper",
				"--reminder-id",
				reminder.id,
				"--token",
				token,
				"--data-dir",
				paths.dataDir,
				"--state-dir",
				paths.stateDir,
			],
			{ timeout: 15_000 },
		).then(
			() => {
				throw new Error("Worker accepted a stale fingerprint");
			},
			(error: { stderr?: string }) => {
				if (!error.stderr?.includes("fingerprint does not match")) throw error;
			},
		);
		await readFile(path.join(root, "pwned")).then(
			() => {
				throw new Error("Hostile reminder text was executed");
			},
			(error: NodeJS.ErrnoException) => {
				if (error.code !== "ENOENT") throw error;
			},
		);
		process.stdout.write(
			"Verified bundled notification helper actions, persistence, and literal argv handling\n",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
