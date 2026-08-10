import path from "node:path";
import { environment, getPreferenceValues } from "@vicinae/api";

type ReminderPreferences = {
	notificationIcon?: string;
};

export function notificationIconSourcePath(): string {
	const configured = getPreferenceValues<ReminderPreferences>().notificationIcon?.trim();
	return configured || path.join(environment.assetsPath, "icon.png");
}
