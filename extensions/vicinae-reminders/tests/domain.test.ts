import { describe, expect, it } from "vitest";
import { resolveReminderLocale } from "../src/domain/locale";
import { newReminder, parseReminderDocument } from "../src/domain/model";
import { parseReminderInput, ReminderParseError } from "../src/domain/parser";
import {
	advanceRecurrenceAfter,
	completeReminderOccurrence,
	effectiveDueDate,
	firstRecurrenceAfter,
	materializeLocalDateTime,
	setReminderRecurrence,
} from "../src/domain/recurrence";

const NOW = new Date("2025-01-15T10:00:00.000Z");

function expectWallDate(
	date: Date,
	year: number,
	month: number,
	day: number,
	hour: number,
	minute = 0,
) {
	expect([
		date.getFullYear(),
		date.getMonth() + 1,
		date.getDate(),
		date.getHours(),
		date.getMinutes(),
	]).toEqual([year, month, day, hour, minute]);
}

describe("reminder parser", () => {
	it("parses relative durations and strips boilerplate/source span", () => {
		const parsed = parseReminderInput("/remind me to call Mum in 30 minutes", NOW);
		expect(parsed.text).toBe("Call Mum");
		expect(parsed.matchedText).toBe("in 30 minutes");
		expect(parsed.usedDefaultTime).toBe(false);
		expect(parsed.due.getTime()).toBe(NOW.getTime() + 30 * 60_000);
	});

	it("handles tomorrow, weekday, absolute dates and default 09:00", () => {
		const tomorrow = parseReminderInput("remind me to call Mum tomorrow", NOW);
		expectWallDate(tomorrow.due, 2025, 1, 16, 9);
		expect(tomorrow.usedDefaultTime).toBe(true);
		const weekday = parseReminderInput("remind me to submit report on Friday", NOW);
		expectWallDate(weekday.due, 2025, 1, 17, 9);
		const absolute = parseReminderInput("remind me to submit report on 25/01/2025 at 16:30", NOW);
		expectWallDate(absolute.due, 2025, 1, 25, 16, 30);
		const dateOnly = parseReminderInput("remind me to check date 2025-01-20", NOW);
		expectWallDate(dateOnly.due, 2025, 1, 20, 9);
	});

	it("supports UK and US numeric dates and recognises noon/midnight", () => {
		const uk = parseReminderInput("remind me to file accounts on 02/03/2025", NOW);
		expectWallDate(uk.due, 2025, 3, 2, 9);
		const us = parseReminderInput("remind me to file accounts on 02/03/2025", NOW, "en-US");
		expectWallDate(us.due, 2025, 2, 3, 9);
		const noon = parseReminderInput("remind me to drink water at noon", NOW);
		expectWallDate(noon.due, 2025, 1, 15, 12);
		const midnight = parseReminderInput("remind me to check at midnight", NOW);
		expectWallDate(midnight.due, 2025, 1, 16, 0);
	});

	it("uses the system region unless the date language is set", () => {
		expect(resolveReminderLocale("auto", "en-US")).toBe("en-US");
		expect(resolveReminderLocale("auto", "en")).toBe("en-US");
		expect(resolveReminderLocale("auto", "en-GB")).toBe("en-GB");
		expect(resolveReminderLocale("auto", "es-US")).toBe("en-US");
		expect(resolveReminderLocale("en-US", "en-GB")).toBe("en-US");
	});

	it("rejects invalid, empty, past and multiple expressions", () => {
		for (const [input, code] of [
			["remind me to tidy up", "no-date"],
			["remind me yesterday", "past-date"],
			["remind me to do thing tomorrow and next week", "multiple-dates"],
		] as const) {
			try {
				parseReminderInput(input, NOW);
				expect.unreachable();
			} catch (error) {
				expect(error).toBeInstanceOf(ReminderParseError);
				expect((error as ReminderParseError).code).toBe(code);
			}
		}
		try {
			parseReminderInput("remind me tomorrow", NOW);
			expect.unreachable();
		} catch (error) {
			expect((error as ReminderParseError).code).toBe("empty-text");
		}
	});
});

describe("recurrence", () => {
	const kinds = ["daily", "weekly", "fortnightly", "monthly"] as const;
	it.each(kinds)("advances %s and collapses missed occurrences", (kind) => {
		const rule = {
			kind,
			anchorDate: "2025-01-01",
			nextDate: "2025-01-01",
			localTime: "09:00",
			weekday: 3,
			dayOfMonth: 1,
			monthEndPolicy: "clamp" as const,
		};
		const next = firstRecurrenceAfter(rule, new Date("2025-01-20T10:00:00Z"));
		expect(materializeLocalDateTime(next.nextDate, next.localTime).getTime()).toBeGreaterThan(
			new Date("2025-01-20T10:00:00Z").getTime(),
		);
		if (kind === "daily") expect(next.nextDate).toBe("2025-01-21");
		if (kind === "weekly") expect(next.nextDate).toBe("2025-01-22");
		if (kind === "fortnightly") expect(next.nextDate).toBe("2025-01-29");
		if (kind === "monthly") expect(next.nextDate).toBe("2025-02-01");
	});

	it("clamps monthly 31st, including February and leap years", () => {
		const rule = {
			kind: "monthly" as const,
			anchorDate: "2024-01-31",
			nextDate: "2024-01-31",
			localTime: "09:00",
			weekday: 3,
			dayOfMonth: 31,
			monthEndPolicy: "clamp" as const,
		};
		expect(advanceRecurrenceAfter(rule, new Date("2024-01-31T10:00Z")).nextDate).toBe("2024-02-29");
		expect(
			advanceRecurrenceAfter({ ...rule, nextDate: "2024-02-29" }, new Date("2024-03-01T00:00Z"))
				.nextDate,
		).toBe("2024-03-31");
	});

	it("preserves effective local due time and clears snooze when recurrence changes", () => {
		const reminder = newReminder("test", new Date("2025-01-10T12:00Z"), NOW);
		const recurring = setReminderRecurrence(reminder, "daily");
		expect(recurring.recurrence?.nextDate).toBe(recurring.recurrence?.anchorDate);
		expect(effectiveDueDate(recurring).getHours()).toBe(12);
		expect(
			setReminderRecurrence({ ...recurring, snoozedUntil: "2025-01-11T12:00Z" }, null).recurrence,
		).toBeNull();
	});

	it("completes one-off reminders and advances recurring reminders", () => {
		const due = new Date("2025-01-15T09:00:00.000Z");
		const oneOff = newReminder("One off", due, new Date("2025-01-14T09:00:00.000Z"));
		expect(completeReminderOccurrence(oneOff, NOW)).toBeNull();
		const recurring = setReminderRecurrence(oneOff, "daily", due);
		const completed = completeReminderOccurrence(recurring, NOW);
		expect(completed).not.toBeNull();
		if (!completed) throw new Error("Recurring reminder was removed");
		expect(effectiveDueDate(completed).getTime()).toBeGreaterThan(NOW.getTime());
	});

	it("handles London DST spring gap and autumn ambiguity when running in London", () => {
		if (new Intl.DateTimeFormat().resolvedOptions().timeZone !== "Europe/London") return;
		const spring = materializeLocalDateTime("2025-03-30", "01:30");
		expectWallDate(spring, 2025, 3, 30, 2, 30);
		const autumn = materializeLocalDateTime("2025-10-26", "01:30");
		expect(autumn.toISOString()).toBe("2025-10-26T00:30:00.000Z");
	});

	it("re-materialises a recurring wall time when the local timezone changes", () => {
		const previous = process.env.TZ;
		try {
			process.env.TZ = "Europe/London";
			const london = materializeLocalDateTime("2025-07-01", "09:00");
			process.env.TZ = "America/New_York";
			const newYork = materializeLocalDateTime("2025-07-01", "09:00");
			expect(london.toISOString()).toBe("2025-07-01T08:00:00.000Z");
			expect(newYork.toISOString()).toBe("2025-07-01T13:00:00.000Z");
		} finally {
			if (previous === undefined) delete process.env.TZ;
			else process.env.TZ = previous;
		}
	});
});

describe("model", () => {
	it("normalises new and legacy reminders and parses recurrence", () => {
		const reminder = newReminder("  Buy milk  ", new Date("2025-01-20T09:00Z"), NOW);
		expect(reminder.text).toBe("Buy milk");
		const legacy = parseReminderDocument({
			id: reminder.id,
			text: " x ",
			createdAt: reminder.createdAt,
			dueAt: reminder.dueAt,
		});
		expect(legacy.migrated).toBe(true);
		expect(legacy.reminder.revision).toBe(1);
		const parsed = parseReminderDocument({
			...reminder,
			recurrence: {
				kind: "daily",
				anchorDate: "2025-01-20",
				nextDate: "2025-01-21",
				localTime: "09:00",
				weekday: 1,
				dayOfMonth: 20,
				monthEndPolicy: "clamp",
			},
		});
		expect(parsed.reminder.recurrence?.kind).toBe("daily");
	});
});
