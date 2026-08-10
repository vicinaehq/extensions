import type { Recurrence, RecurrenceKind, Reminder } from "./model";

type LocalDateParts = { year: number; month: number; day: number };

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

function toLocalDate(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toLocalTime(date: Date): string {
	return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseLocalDate(value: string): LocalDateParts {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) throw new Error(`Invalid local date: ${value}`);
	const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
	const check = new Date(parts.year, parts.month - 1, parts.day, 12);
	if (
		check.getFullYear() !== parts.year ||
		check.getMonth() !== parts.month - 1 ||
		check.getDate() !== parts.day
	) {
		throw new Error(`Invalid local date: ${value}`);
	}
	return parts;
}

function formatLocalDate(parts: LocalDateParts): string {
	return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function materializeLocalDateTime(localDate: string, localTime: string): Date {
	const date = parseLocalDate(localDate);
	const match = /^(\d{2}):(\d{2})$/.exec(localTime);
	if (!match) throw new Error(`Invalid local time: ${localTime}`);
	// JavaScript's compatible local-time resolution is intentional: a nonexistent DST
	// wall time moves forward by the gap, and an ambiguous wall time uses the earlier instant.
	return new Date(date.year, date.month - 1, date.day, Number(match[1]), Number(match[2]), 0, 0);
}

function addCalendarDays(localDate: string, amount: number): string {
	const parts = parseLocalDate(localDate);
	const date = new Date(parts.year, parts.month - 1, parts.day + amount, 12, 0, 0, 0);
	return toLocalDate(date);
}

function daysInMonth(year: number, month: number): number {
	return new Date(year, month, 0, 12).getDate();
}

function addCalendarMonth(localDate: string, targetDay: number): string {
	const parts = parseLocalDate(localDate);
	const zeroBased = parts.month;
	const year = parts.year + Math.floor(zeroBased / 12);
	const month = (zeroBased % 12) + 1;
	return formatLocalDate({ year, month, day: Math.min(targetDay, daysInMonth(year, month)) });
}

function incrementDate(rule: Recurrence, localDate: string): string {
	switch (rule.kind) {
		case "daily":
			return addCalendarDays(localDate, 1);
		case "weekly":
			return addCalendarDays(localDate, 7);
		case "fortnightly":
			return addCalendarDays(localDate, 14);
		case "monthly":
			return addCalendarMonth(localDate, rule.dayOfMonth);
	}
}

export function recurrenceFromDate(kind: RecurrenceKind, date: Date): Recurrence {
	const localDate = toLocalDate(date);
	return {
		kind,
		anchorDate: localDate,
		nextDate: localDate,
		localTime: toLocalTime(date),
		weekday: date.getDay(),
		dayOfMonth: date.getDate(),
		monthEndPolicy: "clamp",
	};
}

export function effectiveDueDate(reminder: Reminder): Date {
	if (reminder.snoozedUntil) return new Date(reminder.snoozedUntil);
	if (reminder.recurrence) {
		return materializeLocalDateTime(reminder.recurrence.nextDate, reminder.recurrence.localTime);
	}
	return new Date(reminder.dueAt);
}

export function advanceRecurrenceAfter(rule: Recurrence, now: Date): Recurrence {
	let nextDate = rule.nextDate;
	for (let count = 0; count < 200_000; count += 1) {
		nextDate = incrementDate(rule, nextDate);
		if (materializeLocalDateTime(nextDate, rule.localTime).getTime() > now.getTime()) {
			return { ...rule, nextDate };
		}
	}
	throw new Error("Could not find the next recurrence within the supported calendar range");
}

export function firstRecurrenceAfter(rule: Recurrence, now: Date): Recurrence {
	let current = rule;
	if (materializeLocalDateTime(current.nextDate, current.localTime).getTime() > now.getTime()) {
		return current;
	}
	current = advanceRecurrenceAfter(current, now);
	return current;
}

export function setReminderRecurrence(
	reminder: Reminder,
	kind: RecurrenceKind | null,
	referenceDate = effectiveDueDate(reminder),
): Reminder {
	if (kind === null) {
		return {
			...reminder,
			dueAt: referenceDate.toISOString(),
			recurrence: null,
			snoozedUntil: undefined,
			pendingNotification: undefined,
		};
	}
	const recurrence = recurrenceFromDate(kind, referenceDate);
	return {
		...reminder,
		dueAt: referenceDate.toISOString(),
		recurrence,
		snoozedUntil: undefined,
		pendingNotification: undefined,
	};
}

export function completeReminderOccurrence(reminder: Reminder, now = new Date()): Reminder | null {
	if (!reminder.recurrence) return null;
	const recurrence = advanceRecurrenceAfter(reminder.recurrence, now);
	return {
		...reminder,
		dueAt: materializeLocalDateTime(recurrence.nextDate, recurrence.localTime).toISOString(),
		recurrence,
		snoozedUntil: undefined,
		pendingNotification: undefined,
		lastAttemptAt: now.toISOString(),
		lastFiredAt: now.toISOString(),
		lastError: undefined,
		failureCount: 0,
	};
}
