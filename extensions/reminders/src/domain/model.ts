import { randomUUID } from "node:crypto";

export const SCHEMA_VERSION = 2 as const;

export type RecurrenceKind = "daily" | "weekly" | "fortnightly" | "monthly";

export type Recurrence = {
	kind: RecurrenceKind;
	anchorDate: string;
	nextDate: string;
	localTime: string;
	weekday: number;
	dayOfMonth: number;
	monthEndPolicy: "clamp";
};

export type PendingNotification = {
	token: string;
	unitName: string;
	claimedAt: string;
};

export type Reminder = {
	schemaVersion: typeof SCHEMA_VERSION;
	revision: number;
	id: string;
	text: string;
	createdAt: string;
	updatedAt: string;
	dueAt: string;
	recurrence: Recurrence | null;
	snoozedUntil?: string;
	lastAttemptAt?: string;
	lastFiredAt?: string;
	lastError?: string;
	failureCount?: number;
	pendingNotification?: PendingNotification;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isValidLocalDate(value: unknown): value is string {
	if (typeof value !== "string" || !LOCAL_DATE_PATTERN.test(value)) return false;
	const [year, month, day] = value.split("-").map(Number);
	const date = new Date(0);
	date.setUTCHours(12, 0, 0, 0);
	date.setUTCFullYear(year, month - 1, day);
	return (
		date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
	);
}

export function isReminderId(value: string): boolean {
	return UUID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoInstant(value: unknown): value is string {
	return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function assertOptionalString(record: Record<string, unknown>, key: string): void {
	if (record[key] !== undefined && typeof record[key] !== "string") {
		throw new Error(`${key} must be a string`);
	}
}

function parseRecurrence(value: unknown): Recurrence | null {
	if (value === null) return null;
	if (!isRecord(value)) throw new Error("recurrence must be an object or null");
	if (!(["daily", "weekly", "fortnightly", "monthly"] as unknown[]).includes(value.kind)) {
		throw new Error("recurrence kind is invalid");
	}
	if (!isValidLocalDate(value.anchorDate)) {
		throw new Error("recurrence anchorDate is invalid");
	}
	if (!isValidLocalDate(value.nextDate)) {
		throw new Error("recurrence nextDate is invalid");
	}
	if (typeof value.localTime !== "string" || !LOCAL_TIME_PATTERN.test(value.localTime)) {
		throw new Error("recurrence localTime is invalid");
	}
	if (
		!Number.isInteger(value.weekday) ||
		(value.weekday as number) < 0 ||
		(value.weekday as number) > 6
	) {
		throw new Error("recurrence weekday is invalid");
	}
	if (
		!Number.isInteger(value.dayOfMonth) ||
		(value.dayOfMonth as number) < 1 ||
		(value.dayOfMonth as number) > 31
	) {
		throw new Error("recurrence dayOfMonth is invalid");
	}
	if (value.monthEndPolicy !== "clamp") {
		throw new Error("recurrence monthEndPolicy is invalid");
	}
	return value as Recurrence;
}

function parsePendingNotification(value: unknown): PendingNotification | undefined {
	if (value === undefined) return undefined;
	if (!isRecord(value)) throw new Error("pendingNotification must be an object");
	if (typeof value.token !== "string" || !isReminderId(value.token)) {
		throw new Error("pendingNotification token is invalid");
	}
	if (
		typeof value.unitName !== "string" ||
		!/^vicinae-reminder-notification-[0-9a-f-]+\.service$/.test(value.unitName)
	) {
		throw new Error("pendingNotification unitName is invalid");
	}
	if (!isIsoInstant(value.claimedAt)) throw new Error("pendingNotification claimedAt is invalid");
	return value as PendingNotification;
}

export function parseReminderDocument(raw: unknown): { reminder: Reminder; migrated: boolean } {
	if (!isRecord(raw)) throw new Error("reminder document must be an object");

	if (raw.schemaVersion === undefined || raw.schemaVersion === 0) {
		if (
			typeof raw.id !== "string" ||
			!isReminderId(raw.id) ||
			typeof raw.text !== "string" ||
			!raw.text.trim() ||
			!isIsoInstant(raw.createdAt) ||
			!isIsoInstant(raw.dueAt) ||
			(raw.recurrence !== undefined && raw.recurrence !== null)
		) {
			throw new Error("legacy schema 0 reminder is invalid");
		}
		const migrated: Reminder = {
			schemaVersion: SCHEMA_VERSION,
			revision: 1,
			id: raw.id,
			text: raw.text.trim(),
			createdAt: raw.createdAt,
			updatedAt: raw.createdAt,
			dueAt: new Date(raw.dueAt).toISOString(),
			recurrence: null,
		};
		return { reminder: migrated, migrated: true };
	}

	if (raw.schemaVersion !== 1 && raw.schemaVersion !== SCHEMA_VERSION) {
		throw new Error(`unsupported reminder schema version ${String(raw.schemaVersion)}`);
	}
	if (typeof raw.id !== "string" || !isReminderId(raw.id)) throw new Error("id is invalid");
	if (typeof raw.text !== "string" || !raw.text.trim()) throw new Error("text is invalid");
	if (!Number.isInteger(raw.revision) || (raw.revision as number) < 1) {
		throw new Error("revision is invalid");
	}
	for (const key of ["createdAt", "updatedAt", "dueAt"] as const) {
		if (!isIsoInstant(raw[key])) throw new Error(`${key} is invalid`);
	}
	for (const key of ["snoozedUntil", "lastAttemptAt", "lastFiredAt"] as const) {
		if (raw[key] !== undefined && !isIsoInstant(raw[key])) throw new Error(`${key} is invalid`);
	}
	assertOptionalString(raw, "lastError");
	if (
		raw.failureCount !== undefined &&
		(!Number.isInteger(raw.failureCount) || (raw.failureCount as number) < 0)
	) {
		throw new Error("failureCount is invalid");
	}

	return {
		reminder: {
			...(raw as Reminder),
			schemaVersion: SCHEMA_VERSION,
			text: raw.text.trim(),
			recurrence: parseRecurrence(raw.recurrence),
			pendingNotification: parsePendingNotification(raw.pendingNotification),
		},
		migrated: raw.schemaVersion === 1,
	};
}

export function newReminder(text: string, due: Date, now = new Date()): Reminder {
	if (!text.trim()) throw new Error("Reminder text cannot be empty");
	if (!Number.isFinite(due.getTime())) throw new Error("Reminder date is invalid");
	const timestamp = now.toISOString();
	return {
		schemaVersion: SCHEMA_VERSION,
		revision: 1,
		id: randomUUID(),
		text: text.trim(),
		createdAt: timestamp,
		updatedAt: timestamp,
		dueAt: due.toISOString(),
		recurrence: null,
	};
}
