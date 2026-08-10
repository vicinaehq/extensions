export type ReminderLocale = "en-GB" | "en-US";

export function resolveReminderLocale(
	preference: string | undefined,
	systemLocale = Intl.DateTimeFormat().resolvedOptions().locale,
): ReminderLocale {
	if (preference === "en-GB" || preference === "en-US") return preference;
	try {
		return new Intl.Locale(systemLocale.replaceAll("_", "-")).maximize().region === "US"
			? "en-US"
			: "en-GB";
	} catch {
		return systemLocale.toLowerCase().startsWith("en-us") ? "en-US" : "en-GB";
	}
}
