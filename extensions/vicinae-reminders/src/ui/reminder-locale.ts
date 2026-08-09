import { getPreferenceValues } from "@vicinae/api";
import { type ReminderLocale, resolveReminderLocale } from "../domain/locale";

type Preferences = { dateLanguage?: string };

export function getReminderLocale(): ReminderLocale {
	return resolveReminderLocale(getPreferenceValues<Preferences>().dateLanguage);
}
