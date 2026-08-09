import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { newReminder } from "../src/domain/model";
import { reminderPathsFromDirectories } from "../src/platform/paths";
import { ReminderStore } from "../src/storage/store";

const run = promisify(execFile);

async function pendingReminder(store: ReminderStore, text: string) {
	const reminder = newReminder(text, new Date(Date.now() - 1_000));
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
	return { reminder, token };
}

async function main(): Promise<void> {
	const root = await mkdtemp(path.join(os.tmpdir(), "vicinae-reminders-worker-check-"));
	try {
		const workerPath = path.resolve("assets/worker.cjs");
		const paths = reminderPathsFromDirectories(path.join(root, "data"), path.join(root, "state"));
		const store = new ReminderStore(paths);
		await store.ensureDirectories();
		await writeFile(paths.notificationIconPath, await readFile(path.resolve("assets/icon.png")));

		const hostile = await pendingReminder(
			store,
			`literal $(touch ${path.join(root, "pwned")}) text`,
		);
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
				hostile.reminder.id,
				"--token",
				hostile.token,
				"--data-dir",
				paths.dataDir,
				"--state-dir",
				paths.stateDir,
				"--notify-send",
				notifierPath,
				"--icon",
				paths.notificationIconPath,
				"--extension-marker",
				workerPath,
			],
			{ env: { ...process.env, REMINDER_CAPTURE: capturePath }, timeout: 15_000 },
		);
		const captured = JSON.parse(await readFile(capturePath, "utf8")) as string[];
		if (captured.at(-1) !== hostile.reminder.text)
			throw new Error("Worker did not preserve reminder text");
		if (await store.get(hostile.reminder.id))
			throw new Error("Worker did not complete the delivered reminder");

		const uninstall = await pendingReminder(store, "Stop after uninstall");
		const extensionMarker = path.join(root, "extension-worker.cjs");
		const startedMarker = path.join(root, "notify-started");
		const waitingNotifier = path.join(root, "waiting-notify.mjs");
		await writeFile(extensionMarker, "present");
		await writeFile(
			waitingNotifier,
			`#!/usr/bin/env node\nimport { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(startedMarker)}, "started");\nsetTimeout(() => {}, 10_000);\n`,
		);
		await chmod(waitingNotifier, 0o755);
		const helper = run(
			process.execPath,
			[
				workerPath,
				"--notification-helper",
				"--reminder-id",
				uninstall.reminder.id,
				"--token",
				uninstall.token,
				"--data-dir",
				paths.dataDir,
				"--state-dir",
				paths.stateDir,
				"--notify-send",
				waitingNotifier,
				"--icon",
				paths.notificationIconPath,
				"--extension-marker",
				extensionMarker,
			],
			{ timeout: 15_000 },
		);
		for (let attempt = 0; attempt < 100; attempt += 1) {
			try {
				await readFile(startedMarker);
				break;
			} catch {
				await delay(25);
			}
		}
		await rm(extensionMarker);
		await helper;
		const retained = await store.get(uninstall.reminder.id);
		if (!retained || retained.pendingNotification || retained.lastError)
			throw new Error("Helper did not exit cleanly after extension removal");

		await readFile(path.join(root, "pwned")).then(
			() => {
				throw new Error("Hostile reminder text was executed");
			},
			(error: NodeJS.ErrnoException) => {
				if (error.code !== "ENOENT") throw error;
			},
		);
		process.stdout.write(
			"Verified notification actions, literal arguments, and uninstall-aware helper exit\n",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
