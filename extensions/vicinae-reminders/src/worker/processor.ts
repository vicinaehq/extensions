import { randomUUID } from "node:crypto";
import { effectiveDueDate } from "../domain/recurrence";
import { ReminderConflictError, type ReminderStore } from "../storage/store";
import type { NotificationDispatcher } from "./notification-dispatcher";

type ReminderOutcome = {
	id: string;
	status: "fired" | "failed" | "skipped";
	error?: string;
};

export type WorkerRunResult = {
	startedAt: string;
	finishedAt: string;
	validCount: number;
	corruptCount: number;
	dueCount: number;
	firedCount: number;
	failedCount: number;
	skippedCount: number;
	outcomes: ReminderOutcome[];
	corrupt: { file: string; error: string }[];
};

export type WorkerOptions = {
	now?: () => Date;
	retryDelayMs?: number;
};

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export async function processDueReminders(
	store: ReminderStore,
	dispatcher: NotificationDispatcher,
	options: WorkerOptions = {},
): Promise<WorkerRunResult> {
	const nowProvider = options.now ?? (() => new Date());
	const retryDelayMs = options.retryDelayMs ?? 30_000;
	const startedAt = nowProvider();
	const scan = await store.list();
	const candidates = scan.reminders
		.filter((reminder) => effectiveDueDate(reminder).getTime() <= startedAt.getTime())
		.sort((a, b) => effectiveDueDate(a).getTime() - effectiveDueDate(b).getTime());
	const outcomes: ReminderOutcome[] = [];

	for (const candidate of candidates) {
		let outcome: ReminderOutcome = { id: candidate.id, status: "skipped" };
		let claimed = false;
		let pending = candidate.pendingNotification;
		try {
			const updated = await store.mutate(candidate.id, undefined, async (current) => {
				const now = nowProvider();
				if (effectiveDueDate(current).getTime() > now.getTime()) return current;
				if (
					current.pendingNotification &&
					(await dispatcher.isActive(current.pendingNotification))
				) {
					return current;
				}
				if (
					!current.pendingNotification &&
					current.lastAttemptAt &&
					now.getTime() - Date.parse(current.lastAttemptAt) < retryDelayMs
				) {
					return current;
				}
				pending = dispatcher.createPending(current.id, randomUUID(), now);
				claimed = true;
				return {
					...current,
					pendingNotification: pending,
					lastAttemptAt: now.toISOString(),
					lastError: undefined,
				};
			});
			if (!claimed || !pending || !updated) {
				outcomes.push(outcome);
				continue;
			}

			try {
				await dispatcher.dispatch(updated, pending);
				outcome = { id: updated.id, status: "fired" };
			} catch (error) {
				const message = errorMessage(error);
				outcome = { id: updated.id, status: "failed", error: message };
				await store.mutate(updated.id, undefined, (current) => {
					if (current.pendingNotification?.token !== pending?.token) return current;
					return {
						...current,
						pendingNotification: undefined,
						lastAttemptAt: nowProvider().toISOString(),
						lastError: message.slice(0, 2_000),
						failureCount: (current.failureCount ?? 0) + 1,
					};
				});
			}
		} catch (error) {
			if (!(error instanceof ReminderConflictError)) {
				outcome = { id: candidate.id, status: "failed", error: errorMessage(error) };
			}
		}
		outcomes.push(outcome);
	}

	return {
		startedAt: startedAt.toISOString(),
		finishedAt: nowProvider().toISOString(),
		validCount: scan.reminders.length,
		corruptCount: scan.corrupt.length,
		dueCount: candidates.length,
		firedCount: outcomes.filter((item) => item.status === "fired").length,
		failedCount: outcomes.filter((item) => item.status === "failed").length,
		skippedCount: outcomes.filter((item) => item.status === "skipped").length,
		outcomes,
		corrupt: scan.corrupt,
	};
}
