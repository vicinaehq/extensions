import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const DEFAULT_NOTIFICATION_TIMEOUT_MS = 60 * 60_000;

export interface ReminderNotifier {
	send(text: string): Promise<NotificationAction>;
}

export type NotificationAction =
	| "complete"
	| "snooze-10m"
	| "snooze-1h"
	| "snooze-tomorrow"
	| "extension-removed"
	| "closed";

export class NotifySendNotifier implements ReminderNotifier {
	constructor(
		private readonly executable = "notify-send",
		private readonly timeoutMs = DEFAULT_NOTIFICATION_TIMEOUT_MS,
		private readonly icon = "appointment-soon",
		private readonly extensionMarker?: string,
		private readonly markerPollMs = 1_000,
	) {}

	private async sendNotification(
		summary: string,
		text: string,
		actions: string[],
	): Promise<string> {
		if (this.extensionMarker && !existsSync(this.extensionMarker)) return "extension-removed";
		const controller = new AbortController();
		let markerRemoved = false;
		const markerWatcher = this.extensionMarker
			? setInterval(() => {
					if (!existsSync(this.extensionMarker as string)) {
						markerRemoved = true;
						controller.abort();
					}
				}, this.markerPollMs)
			: undefined;
		try {
			const result = await execFileAsync(
				this.executable,
				[
					"--app-name=Reminders",
					`--icon=${this.icon}`,
					"--urgency=normal",
					`--expire-time=${this.timeoutMs}`,
					"--wait",
					...actions,
					summary,
					text,
				],
				{
					timeout: this.timeoutMs,
					windowsHide: true,
					maxBuffer: 64 * 1024,
					signal: controller.signal,
				},
			);
			return result.stdout.trim();
		} catch (error) {
			if (markerRemoved) return "extension-removed";
			throw error;
		} finally {
			if (markerWatcher) clearInterval(markerWatcher);
		}
	}

	async send(text: string): Promise<NotificationAction> {
		const primaryAction = await this.sendNotification("Reminder", text, [
			"--action=complete=Complete",
			"--action=snooze-menu=Snooze...",
		]);
		if (primaryAction === "extension-removed") return "extension-removed";
		if (primaryAction === "complete") return "complete";
		if (primaryAction !== "snooze-menu") return "closed";

		const snoozeAction = await this.sendNotification("Snooze Reminder", text, [
			"--action=snooze-10m=10 minutes",
			"--action=snooze-1h=1 hour",
			"--action=snooze-tomorrow=Tomorrow at 09:00",
		]);
		if (snoozeAction === "extension-removed") return "extension-removed";
		return snoozeAction === "snooze-10m" ||
			snoozeAction === "snooze-1h" ||
			snoozeAction === "snooze-tomorrow"
			? snoozeAction
			: "closed";
	}
}
