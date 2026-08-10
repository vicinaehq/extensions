import * as chrono from "chrono-node";
import type { ReminderLocale } from "./locale";

export class ReminderParseError extends Error {
	constructor(
		message: string,
		readonly code: "no-date" | "multiple-dates" | "empty-text" | "past-date",
	) {
		super(message);
		this.name = "ReminderParseError";
	}
}

export type ParsedReminder = {
	text: string;
	due: Date;
	matchedText: string;
	usedDefaultTime: boolean;
};

function cleanReminderText(value: string, locale: ReminderLocale): string {
	let text = value
		.replace(/^\s*\/?remind(?:er)?\b\s*/i, "")
		.replace(/^\s*me\b\s*/i, "")
		.replace(/^\s*to\b\s*/i, "")
		.replace(/\s+/g, " ")
		.replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, "")
		.trim();
	if (text) text = text[0].toLocaleUpperCase(locale) + text.slice(1);
	return text;
}

export function parseReminderInput(
	input: string,
	now = new Date(),
	locale: ReminderLocale = "en-GB",
): ParsedReminder {
	const parser = locale === "en-US" ? chrono.en.casual : chrono.en.GB;
	const results = parser.parse(input, now, { forwardDate: true });
	if (results.length === 0) {
		throw new ReminderParseError("Couldn't find a time in that reminder", "no-date");
	}
	if (results.length > 1) {
		throw new ReminderParseError(
			"Found more than one time; please use a single due time",
			"multiple-dates",
		);
	}

	const result = results[0];
	const usedDefaultTime = !result.start.isCertain("hour") && !result.start.isCertain("minute");
	const due = result.start.date();
	if (usedDefaultTime) due.setHours(9, 0, 0, 0);
	else due.setSeconds(0, 0);
	if (
		usedDefaultTime &&
		due.getTime() <= now.getTime() &&
		result.start.isCertain("weekday") &&
		!result.start.isCertain("day")
	) {
		due.setDate(due.getDate() + 7);
	}
	if (!Number.isFinite(due.getTime()) || due.getTime() <= now.getTime()) {
		throw new ReminderParseError("That reminder time is not in the future", "past-date");
	}

	const before = input.slice(0, result.index);
	const after = input.slice(result.index + result.text.length);
	const text = cleanReminderText(`${before} ${after}`, locale);
	if (!text)
		throw new ReminderParseError("Please include something to be reminded about", "empty-text");

	return { text, due, matchedText: result.text, usedDefaultTime };
}
