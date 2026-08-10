import { completeReminderOccurrence } from "../domain/recurrence";
import { ReminderConflictError, type ReminderStore } from "../storage/store";
import type { NotificationAction, ReminderNotifier } from "./notifier";

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function snoozeTarget(
	action: Exclude<NotificationAction, "complete" | "closed" | "extension-removed">,
	now: Date,
): Date {
	if (action === "snooze-10m") return new Date(now.getTime() + 10 * 60_000);
	if (action === "snooze-1h") return new Date(now.getTime() + 60 * 60_000);
	const tomorrow = new Date(now);
	tomorrow.setDate(tomorrow.getDate() + 1);
	tomorrow.setHours(9, 0, 0, 0);
	return tomorrow;
}

export async function completeNotificationAction(
	store: ReminderStore,
	reminderId: string,
	token: string,
	action: NotificationAction,
	now = new Date(),
): Promise<void> {
	try {
		await store.mutate(reminderId, undefined, (current) => {
			if (current.pendingNotification?.token !== token) return current;
			if (action === "extension-removed") {
				return {
					...current,
					pendingNotification: undefined,
					lastAttemptAt: now.toISOString(),
					lastError: undefined,
				};
			}
			if (action === "closed") {
				return {
					...current,
					pendingNotification: undefined,
					lastAttemptAt: now.toISOString(),
					lastError: "Notification closed without choosing an action",
				};
			}
			if (action !== "complete") {
				const snoozedUntil = snoozeTarget(action, now).toISOString();
				return {
					...current,
					dueAt: snoozedUntil,
					snoozedUntil: current.recurrence ? snoozedUntil : undefined,
					pendingNotification: undefined,
					lastAttemptAt: undefined,
					lastError: undefined,
					failureCount: 0,
				};
			}
			return completeReminderOccurrence(current, now);
		});
	} catch (error) {
		if (!(error instanceof ReminderConflictError)) throw error;
	}
}

export async function runNotificationHelper(
	store: ReminderStore,
	notifier: ReminderNotifier,
	reminderId: string,
	token: string,
	now = () => new Date(),
): Promise<void> {
	const reminder = await store.get(reminderId);
	if (!reminder || reminder.pendingNotification?.token !== token) return;
	try {
		const action = await notifier.send(reminder.text);
		await completeNotificationAction(store, reminderId, token, action, now());
	} catch (error) {
		const message = errorMessage(error);
		try {
			await store.mutate(reminderId, undefined, (current) => {
				if (current.pendingNotification?.token !== token) return current;
				return {
					...current,
					pendingNotification: undefined,
					lastAttemptAt: now().toISOString(),
					lastError: message.slice(0, 2_000),
					failureCount: (current.failureCount ?? 0) + 1,
				};
			});
		} catch (mutationError) {
			if (!(mutationError instanceof ReminderConflictError)) throw mutationError;
		}
		throw error;
	}
}
