import path from "node:path";
import { environment } from "@vicinae/api";
import type { ReminderLocale } from "../domain/locale";
import { newReminder } from "../domain/model";
import { parseReminderInput } from "../domain/parser";
import { ensureInfrastructure } from "../infrastructure/infrastructure";
import { ReminderStore } from "../storage/store";
import { notificationIconSourcePath } from "./notification-icon";

export async function createReminderFromInput(input: string, locale: ReminderLocale) {
	const parsed = parseReminderInput(input, new Date(), locale);
	await ensureInfrastructure({
		workerSourcePath: path.join(environment.assetsPath, "worker.cjs"),
		iconSourcePath: notificationIconSourcePath(),
	});
	await new ReminderStore().create(newReminder(parsed.text, parsed.due));
	return parsed;
}
