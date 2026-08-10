import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PendingNotification, Reminder } from "../src/domain/model";
import { newReminder } from "../src/domain/model";
import { effectiveDueDate, setReminderRecurrence } from "../src/domain/recurrence";
import { reminderPathsFromDirectories } from "../src/platform/paths";
import { ReminderConflictError, ReminderStore } from "../src/storage/store";
import { completeNotificationAction } from "../src/worker/notification-actions";
import type { NotificationDispatcher } from "../src/worker/notification-dispatcher";
import { DEFAULT_NOTIFICATION_TIMEOUT_MS, NotifySendNotifier } from "../src/worker/notifier";
import { processDueReminders } from "../src/worker/processor";

const temporaryDirectories: string[] = [];

async function temporaryStore(): Promise<{ store: ReminderStore; root: string }> {
	const root = await mkdtemp(path.join(os.tmpdir(), "vicinae-reminders-worker-"));
	temporaryDirectories.push(root);
	const store = new ReminderStore(
		reminderPathsFromDirectories(path.join(root, "data"), path.join(root, "state")),
	);
	await store.ensureDirectories();
	return { store, root };
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

class RecordingDispatcher implements NotificationDispatcher {
	readonly sent: string[] = [];
	constructor(
		private readonly store: ReminderStore,
		private readonly now: () => Date,
		private readonly failure?: (text: string) => Error | undefined,
		private readonly activeUnits = new Set<string>(),
	) {}
	createPending(reminderId: string, token: string, claimedAt: Date): PendingNotification {
		return {
			token,
			claimedAt: claimedAt.toISOString(),
			unitName: `vicinae-reminder-notification-${reminderId}-${token}.service`,
		};
	}
	async dispatch(reminder: Reminder, pending: PendingNotification): Promise<void> {
		this.sent.push(reminder.text);
		const failure = this.failure?.(reminder.text);
		if (failure) throw failure;
		this.activeUnits.add(pending.unitName);
		await completeNotificationAction(
			this.store,
			reminder.id,
			pending.token,
			"complete",
			this.now(),
		);
		this.activeUnits.delete(pending.unitName);
	}
	async isActive(pending: PendingNotification): Promise<boolean> {
		return this.activeUnits.has(pending.unitName);
	}
}

function deferredDispatcher(
	store: ReminderStore,
	now: () => Date,
	activeUnits = new Set<string>(),
) {
	let release!: () => void;
	let started!: () => void;
	const startedPromise = new Promise<void>((resolve) => {
		started = resolve;
	});
	const releasePromise = new Promise<void>((resolve) => {
		release = resolve;
	});
	const sent: string[] = [];
	const dispatcher: NotificationDispatcher = {
		createPending(reminderId, token, claimedAt) {
			return {
				token,
				claimedAt: claimedAt.toISOString(),
				unitName: `vicinae-reminder-notification-${reminderId}-${token}.service`,
			};
		},
		async dispatch(reminder, pending) {
			sent.push(reminder.text);
			activeUnits.add(pending.unitName);
			started();
			await releasePromise;
			await completeNotificationAction(store, reminder.id, pending.token, "complete", now());
			activeUnits.delete(pending.unitName);
		},
		async isActive(pending) {
			return activeUnits.has(pending.unitName);
		},
	};
	return { dispatcher, sent, started: startedPromise, release, activeUnits };
}

describe("worker processing", () => {
	it("fires every due reminder and handles one-off and recurring records", async () => {
		const { store } = await temporaryStore();
		const now = new Date("2026-08-08T10:00:00.000Z");
		const first = newReminder(
			"One",
			new Date(now.getTime() - 60_000),
			new Date(now.getTime() - 3_600_000),
		);
		const second = newReminder(
			"Two",
			new Date(now.getTime() - 30_000),
			new Date(now.getTime() - 3_600_000),
		);
		const recurring = setReminderRecurrence(
			newReminder(
				"Repeat",
				new Date(now.getTime() - 86_400_000),
				new Date(now.getTime() - 172_800_000),
			),
			"daily",
			new Date(now.getTime() - 86_400_000),
		);
		await Promise.all([store.create(first), store.create(second), store.create(recurring)]);
		const notifier = new RecordingDispatcher(store, () => now);
		const result = await processDueReminders(store, notifier, { now: () => now });
		expect(result.firedCount).toBe(3);
		expect(notifier.sent).toEqual(["Repeat", "One", "Two"]);
		expect(await store.get(first.id)).toBeNull();
		expect(await store.get(second.id)).toBeNull();
		const advanced = await store.get(recurring.id);
		expect(advanced).not.toBeNull();
		if (!advanced) throw new Error("Recurring reminder disappeared");
		expect(effectiveDueDate(advanced).getTime()).toBeGreaterThan(now.getTime());
	});

	it("isolates a corrupt file and continues with valid reminders", async () => {
		const { store } = await temporaryStore();
		const now = new Date("2026-08-08T10:00:00.000Z");
		const reminder = newReminder("Still fires", new Date(now.getTime() - 1_000), now);
		await store.create(reminder);
		await writeFile(path.join(store.paths.remindersDir, "broken.json"), "{not-json");
		const notifier = new RecordingDispatcher(store, () => now);
		const result = await processDueReminders(store, notifier, { now: () => now });
		expect(result.corruptCount).toBe(1);
		expect(result.firedCount).toBe(1);
		expect(notifier.sent).toEqual(["Still fires"]);
	});

	it("keeps failed notifications due, records the error, and retries after the delay", async () => {
		const { store } = await temporaryStore();
		let now = new Date("2026-08-08T10:00:00.000Z");
		const reminder = newReminder("Retry me", new Date(now.getTime() - 1_000), now);
		await store.create(reminder);
		const failure = await processDueReminders(
			store,
			new RecordingDispatcher(
				store,
				() => now,
				() => new Error("No notification daemon"),
			),
			{
				now: () => now,
				retryDelayMs: 30_000,
			},
		);
		expect(failure.failedCount).toBe(1);
		const retained = await store.get(reminder.id);
		expect(retained?.lastError).toContain("No notification daemon");
		expect(retained?.failureCount).toBe(1);

		now = new Date(now.getTime() + 10_000);
		const tooSoon = new RecordingDispatcher(store, () => now);
		expect(
			(await processDueReminders(store, tooSoon, { now: () => now, retryDelayMs: 30_000 }))
				.skippedCount,
		).toBe(1);
		expect(tooSoon.sent).toEqual([]);

		now = new Date(now.getTime() + 21_000);
		const recovered = new RecordingDispatcher(store, () => now);
		expect(
			(await processDueReminders(store, recovered, { now: () => now, retryDelayMs: 30_000 }))
				.firedCount,
		).toBe(1);
		expect(await store.get(reminder.id)).toBeNull();
	});

	it("continues after one notification fails", async () => {
		const { store } = await temporaryStore();
		const now = new Date("2026-08-08T10:00:00.000Z");
		const failing = newReminder("Fails", new Date(now.getTime() - 2_000), now);
		const healthy = newReminder("Works", new Date(now.getTime() - 1_000), now);
		await Promise.all([store.create(failing), store.create(healthy)]);
		const notifier = new RecordingDispatcher(
			store,
			() => now,
			(text) => (text === "Fails" ? new Error("temporary failure") : undefined),
		);
		const result = await processDueReminders(store, notifier, { now: () => now });
		expect(result).toMatchObject({ firedCount: 1, failedCount: 1 });
		expect(notifier.sent).toEqual(["Fails", "Works"]);
		expect(await store.get(failing.id)).not.toBeNull();
		expect(await store.get(healthy.id)).toBeNull();
	});

	it("collapses several missed recurring occurrences into one notification", async () => {
		const { store } = await temporaryStore();
		const original = new Date(2026, 0, 1, 9, 0);
		const now = new Date(2026, 0, 20, 12, 0);
		const reminder = setReminderRecurrence(
			newReminder("Daily", original, original),
			"daily",
			original,
		);
		await store.create(reminder);
		const notifier = new RecordingDispatcher(store, () => now);
		await processDueReminders(store, notifier, { now: () => now });
		expect(notifier.sent).toEqual(["Daily"]);
		const next = await store.get(reminder.id);
		if (!next) throw new Error("Recurring reminder disappeared");
		expect(effectiveDueDate(next).getTime()).toBeGreaterThan(now.getTime());
		const backwards = new RecordingDispatcher(store, () => now);
		await processDueReminders(store, backwards, {
			now: () => new Date(now.getTime() - 2 * 60 * 60_000),
		});
		expect(backwards.sent).toEqual([]);
	});

	it("keeps a concurrently-created due reminder for the next worker pass", async () => {
		const { store } = await temporaryStore();
		const now = new Date("2026-08-08T10:00:00.000Z");
		const firstReminder = newReminder("First", new Date(now.getTime() - 2_000), now);
		const laterReminder = newReminder("Created concurrently", new Date(now.getTime() - 1_000), now);
		await store.create(firstReminder);
		const blocked = deferredDispatcher(store, () => now);
		const firstPass = processDueReminders(store, blocked.dispatcher, { now: () => now });
		await blocked.started;
		const create = store.create(laterReminder);
		blocked.release();
		await Promise.all([firstPass, create]);
		expect(await store.get(laterReminder.id)).not.toBeNull();
		const secondNotifier = new RecordingDispatcher(store, () => now);
		await processDueReminders(store, secondNotifier, { now: () => now });
		expect(secondNotifier.sent).toEqual(["Created concurrently"]);
	});

	it("serializes overlapping workers so a one-off reminder is sent once", async () => {
		const { store } = await temporaryStore();
		const now = new Date("2026-08-08T10:00:00.000Z");
		const reminder = newReminder("Only once", new Date(now.getTime() - 1_000), now);
		await store.create(reminder);
		const activeUnits = new Set<string>();
		const blocked = deferredDispatcher(store, () => now, activeUnits);
		const first = processDueReminders(store, blocked.dispatcher, { now: () => now });
		await blocked.started;
		const secondNotifier = new RecordingDispatcher(store, () => now, undefined, activeUnits);
		const second = processDueReminders(store, secondNotifier, { now: () => now });
		blocked.release();
		await Promise.all([first, second]);
		expect(blocked.sent).toEqual(["Only once"]);
		expect(secondNotifier.sent).toEqual([]);
		expect(await store.get(reminder.id)).toBeNull();
	});

	it("does not resurrect a reminder deleted while notification is in flight", async () => {
		const { store } = await temporaryStore();
		const now = new Date("2026-08-08T10:00:00.000Z");
		const reminder = newReminder("Delete race", new Date(now.getTime() - 1_000), now);
		await store.create(reminder);
		const blocked = deferredDispatcher(store, () => now);
		const worker = processDueReminders(store, blocked.dispatcher, { now: () => now });
		await blocked.started;
		const deletion = expect(store.delete(reminder.id, reminder.revision)).rejects.toBeInstanceOf(
			ReminderConflictError,
		);
		blocked.release();
		await worker;
		await deletion;
		expect(await store.get(reminder.id)).toBeNull();
	});

	it("rejects a stale edit instead of overwriting a worker recurrence advance", async () => {
		const { store } = await temporaryStore();
		const now = new Date(2026, 7, 8, 10, 0);
		const originalDue = new Date(2026, 7, 7, 9, 0);
		const reminder = setReminderRecurrence(
			newReminder("Edit race", originalDue, originalDue),
			"daily",
			originalDue,
		);
		await store.create(reminder);
		const blocked = deferredDispatcher(store, () => now);
		const worker = processDueReminders(store, blocked.dispatcher, { now: () => now });
		await blocked.started;
		const edit = expect(
			store.mutate(reminder.id, reminder.revision, (current) => ({
				...current,
				text: "Stale edit",
			})),
		).rejects.toBeInstanceOf(ReminderConflictError);
		blocked.release();
		await worker;
		await edit;
		const current = await store.get(reminder.id);
		expect(current?.text).toBe("Edit race");
		if (!current) throw new Error("Recurring reminder disappeared");
		expect(effectiveDueDate(current).getTime()).toBeGreaterThan(now.getTime());
	});
});

describe("notify-send transport", () => {
	it("times out a stuck notification client", async () => {
		const { root } = await temporaryStore();
		const script = path.join(root, "stuck-notify");
		await writeFile(script, "#!/bin/sh\nsleep 2\n");
		await chmod(script, 0o755);
		await expect(new NotifySendNotifier(script, 25).send("Hello")).rejects.toMatchObject({
			killed: true,
		});
	});

	it("passes hostile reminder text as one literal argument without shell evaluation", async () => {
		const { root } = await temporaryStore();
		const script = path.join(root, "capture-notify");
		const output = path.join(root, "args.txt");
		const marker = path.join(root, "SHOULD_NOT_EXIST");
		await writeFile(script, `#!/bin/sh\nprintf '%s\\n' "$@" > "${output}"\n`);
		await chmod(script, 0o755);
		const hostile = `$(touch ${marker}); ` + `\`touch ${marker}\`; "quoted"`;
		const notificationIcon = path.join(root, "custom reminder icon.png");
		await new NotifySendNotifier(script, undefined, notificationIcon).send(hostile);
		const args = (await readFile(output, "utf8")).trim().split("\n");
		expect(args.at(-1)).toBe(hostile);
		expect(args).toContain("--urgency=normal");
		expect(args).toContain(`--expire-time=${DEFAULT_NOTIFICATION_TIMEOUT_MS}`);
		expect(args).toContain("--wait");
		expect(args).toContain(`--icon=${notificationIcon}`);
		expect(args.filter((argument) => argument.startsWith("--action="))).toEqual([
			"--action=complete=Complete",
			"--action=snooze-menu=Snooze...",
		]);
		expect(
			await new NotifySendNotifier(script, undefined, notificationIcon).send(
				"Closed without action",
			),
		).toBe("closed");
		await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("opens a second notification for the grouped snooze choices", async () => {
		const { root } = await temporaryStore();
		const script = path.join(root, "snooze-menu-notify");
		const state = path.join(root, "called-once");
		await writeFile(
			script,
			`#!/bin/sh\nif [ -e ${JSON.stringify(state)} ]; then printf 'snooze-1h\\n'; else : > ${JSON.stringify(state)}; printf 'snooze-menu\\n'; fi\n`,
		);
		await chmod(script, 0o755);
		expect(await new NotifySendNotifier(script).send("Group these")).toBe("snooze-1h");
	});

	it("stops waiting when the extension asset is removed", async () => {
		const { root } = await temporaryStore();
		const script = path.join(root, "waiting-notify");
		const marker = path.join(root, "worker.cjs");
		await writeFile(script, "#!/bin/sh\nsleep 5\n");
		await writeFile(marker, "extension asset");
		await chmod(script, 0o755);
		const notification = new NotifySendNotifier(script, undefined, "icon", marker, 10).send(
			"Uninstall check",
		);
		await new Promise((resolve) => setTimeout(resolve, 50));
		await rm(marker);
		expect(await notification).toBe("extension-removed");
	});
});
