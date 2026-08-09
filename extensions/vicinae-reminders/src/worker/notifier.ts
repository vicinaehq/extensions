import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ReminderNotifier {
	send(text: string): Promise<NotificationAction>;
}

export type NotificationAction =
	| "complete"
	| "snooze-10m"
	| "snooze-1h"
	| "snooze-tomorrow"
	| "closed";

export class NotifySendNotifier implements ReminderNotifier {
	constructor(
		private readonly executable = "notify-send",
		private readonly timeoutMs?: number,
		private readonly icon = "appointment-soon",
	) {}

	private async sendNotification(
		summary: string,
		text: string,
		actions: string[],
	): Promise<string> {
		const result = await execFileAsync(
			this.executable,
			[
				"--app-name=Reminders",
				`--icon=${this.icon}`,
				"--urgency=normal",
				"--expire-time=0",
				"--wait",
				...actions,
				summary,
				text,
			],
			{
				timeout: this.timeoutMs,
				windowsHide: true,
				maxBuffer: 64 * 1024,
			},
		);
		return result.stdout.trim();
	}

	async send(text: string): Promise<NotificationAction> {
		const primaryAction = await this.sendNotification("Reminder", text, [
			"--action=complete=Complete",
			"--action=snooze-menu=Snooze...",
		]);
		if (primaryAction === "complete") return "complete";
		if (primaryAction !== "snooze-menu") return "closed";

		const snoozeAction = await this.sendNotification("Snooze Reminder", text, [
			"--action=snooze-10m=10 minutes",
			"--action=snooze-1h=1 hour",
			"--action=snooze-tomorrow=Tomorrow at 09:00",
		]);
		return snoozeAction === "snooze-10m" ||
			snoozeAction === "snooze-1h" ||
			snoozeAction === "snooze-tomorrow"
			? snoozeAction
			: "closed";
	}
}
