import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { newReminder, type PendingNotification } from "../src/domain/model";
import { effectiveDueDate, setReminderRecurrence } from "../src/domain/recurrence";
import type { InfrastructureManifest } from "../src/infrastructure/infrastructure";
import { reminderPathsFromDirectories } from "../src/platform/paths";
import { ReminderStore } from "../src/storage/store";
import { runNotificationHelper } from "../src/worker/notification-actions";
import { SystemdNotificationDispatcher } from "../src/worker/notification-dispatcher";
import type { NotificationAction, ReminderNotifier } from "../src/worker/notifier";

const roots: string[] = [];

async function makeStore(): Promise<{ store: ReminderStore; root: string }> {
	const root = await mkdtemp(path.join(os.tmpdir(), "vicinae-notification-actions-"));
	roots.push(root);
	const store = new ReminderStore(
		reminderPathsFromDirectories(path.join(root, "data"), path.join(root, "state")),
	);
	await store.ensureDirectories();
	return { store, root };
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createPending(
	store: ReminderStore,
	text: string,
	due: Date,
	recurrence: "daily" | null = null,
) {
	const base = newReminder(text, due, new Date(due.getTime() - 60_000));
	const reminder = recurrence ? setReminderRecurrence(base, recurrence, due) : base;
	const token = "123e4567-e89b-12d3-a456-426614174999";
	const pending: PendingNotification = {
		token,
		claimedAt: due.toISOString(),
		unitName: `vicinae-reminder-notification-${reminder.id}-${token}.service`,
	};
	await store.create({ ...reminder, pendingNotification: pending });
	return { reminder, pending };
}

function notifier(action: NotificationAction | Error, sent: string[] = []): ReminderNotifier {
	return {
		async send(text) {
			sent.push(text);
			if (action instanceof Error) throw action;
			return action;
		},
	};
}

describe("notification action helper", () => {
	it("snoozes a one-off reminder for ten minutes", async () => {
		const { store } = await makeStore();
		const due = new Date("2026-08-08T10:00:00.000Z");
		const { reminder, pending } = await createPending(store, "Snooze me", due);
		await runNotificationHelper(
			store,
			notifier("snooze-10m"),
			reminder.id,
			pending.token,
			() => due,
		);
		const snoozed = await store.get(reminder.id);
		expect(snoozed?.pendingNotification).toBeUndefined();
		expect(snoozed?.dueAt).toBe("2026-08-08T10:10:00.000Z");
	});

	it("supports the full notification snooze menu", async () => {
		const now = new Date(2026, 7, 8, 10, 0);
		for (const [action, expected] of [
			["snooze-1h", new Date(2026, 7, 8, 11, 0)],
			["snooze-tomorrow", new Date(2026, 7, 9, 9, 0)],
		] as const) {
			const { store } = await makeStore();
			const { reminder, pending } = await createPending(store, action, now);
			await runNotificationHelper(store, notifier(action), reminder.id, pending.token, () => now);
			expect((await store.get(reminder.id))?.dueAt).toBe(expected.toISOString());
		}
	});

	it("completes one-off reminders and advances recurring reminders", async () => {
		const { store } = await makeStore();
		const due = new Date(2026, 7, 8, 9, 0);
		const oneOff = await createPending(store, "One off", due);
		const recurring = await createPending(store, "Daily", due, "daily");
		const now = new Date(2026, 7, 10, 12, 0);
		await runNotificationHelper(
			store,
			notifier("complete"),
			oneOff.reminder.id,
			oneOff.pending.token,
			() => now,
		);
		await runNotificationHelper(
			store,
			notifier("complete"),
			recurring.reminder.id,
			recurring.pending.token,
			() => now,
		);
		expect(await store.get(oneOff.reminder.id)).toBeNull();
		const advanced = await store.get(recurring.reminder.id);
		if (!advanced) throw new Error("Recurring reminder disappeared");
		expect(advanced.pendingNotification).toBeUndefined();
		expect(effectiveDueDate(advanced).getTime()).toBeGreaterThan(now.getTime());
	});

	it("does not complete a reminder when the notification closes without an action", async () => {
		const { store } = await makeStore();
		const due = new Date("2026-08-08T10:00:00.000Z");
		const { reminder, pending } = await createPending(store, "Still due", due);
		await runNotificationHelper(store, notifier("closed"), reminder.id, pending.token, () => due);
		const retained = await store.get(reminder.id);
		expect(retained?.dueAt).toBe(due.toISOString());
		expect(retained?.pendingNotification).toBeUndefined();
		expect(retained?.lastAttemptAt).toBe(due.toISOString());
		expect(retained?.lastError).toContain("without choosing an action");
	});

	it("retains a reminder when notification delivery fails", async () => {
		const { store } = await makeStore();
		const due = new Date("2026-08-08T10:00:00.000Z");
		const { reminder, pending } = await createPending(store, "Retry me", due);
		await expect(
			runNotificationHelper(
				store,
				notifier(new Error("daemon unavailable")),
				reminder.id,
				pending.token,
				() => due,
			),
		).rejects.toThrow("daemon unavailable");
		const retained = await store.get(reminder.id);
		expect(retained?.pendingNotification).toBeUndefined();
		expect(retained?.lastError).toContain("daemon unavailable");
	});
});

describe("transient systemd dispatch", () => {
	it("never passes untrusted reminder text to systemd-run", async () => {
		const { store, root } = await makeStore();
		const output = path.join(root, "systemd-run-args.txt");
		const executable = path.join(root, "fake-systemd-run");
		await writeFile(executable, `#!/bin/sh\nprintf '%s\\n' "$@" > "${output}"\n`);
		await chmod(executable, 0o755);
		const manifest: InfrastructureManifest = {
			infrastructureVersion: 4,
			workerVersion: "1.5.0",
			schemaVersion: 2,
			workerSha256: "hash",
			notificationIconSha256: "icon-hash",
			nodePath: "/usr/bin/node",
			notifySendPath: "/usr/bin/notify-send",
			systemctlPath: "/usr/bin/systemctl",
			systemdRunPath: executable,
			busctlPath: "/usr/bin/busctl",
			notificationCapabilities: ["actions"],
			installedAt: new Date().toISOString(),
		};
		const dispatcher = new SystemdNotificationDispatcher(store.paths, manifest);
		const reminder = newReminder("$(touch /tmp/never-run)", new Date(Date.now() - 1_000));
		const pending = dispatcher.createPending(
			reminder.id,
			"123e4567-e89b-12d3-a456-426614174999",
			new Date(),
		);
		await dispatcher.dispatch(reminder, pending);
		const args = await readFile(output, "utf8");
		expect(args).not.toContain(reminder.text);
		expect(args).toContain(reminder.id);
		expect(args).toContain("--notification-helper");
	});
});
