import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PendingNotification, Reminder } from "../domain/model";
import type { InfrastructureManifest } from "../infrastructure/infrastructure";
import type { ReminderPaths } from "../platform/paths";

const execFileAsync = promisify(execFile);

export interface NotificationDispatcher {
	createPending(reminderId: string, token: string, claimedAt: Date): PendingNotification;
	dispatch(reminder: Reminder, pending: PendingNotification): Promise<void>;
	isActive(pending: PendingNotification): Promise<boolean>;
}

export class SystemdNotificationDispatcher implements NotificationDispatcher {
	constructor(
		private readonly paths: ReminderPaths,
		private readonly manifest: InfrastructureManifest,
	) {}

	createPending(reminderId: string, token: string, claimedAt: Date): PendingNotification {
		return {
			token,
			unitName: `vicinae-reminder-notification-${reminderId}-${token}.service`,
			claimedAt: claimedAt.toISOString(),
		};
	}

	async dispatch(reminder: Reminder, pending: PendingNotification): Promise<void> {
		await execFileAsync(
			this.manifest.systemdRunPath,
			[
				"--user",
				"--quiet",
				"--collect",
				`--unit=${pending.unitName}`,
				"--property=NoNewPrivileges=yes",
				"--property=PrivateTmp=yes",
				"--property=UMask=0077",
				"--",
				this.manifest.nodePath,
				this.manifest.workerSourcePath,
				"--notification-helper",
				"--reminder-id",
				reminder.id,
				"--token",
				pending.token,
				"--data-dir",
				this.paths.dataDir,
				"--state-dir",
				this.paths.stateDir,
				"--notify-send",
				this.manifest.notifySendPath,
				"--icon",
				this.paths.notificationIconPath,
				"--extension-marker",
				this.manifest.workerSourcePath,
			],
			{ timeout: 15_000, windowsHide: true, maxBuffer: 64 * 1024 },
		);
	}

	async isActive(pending: PendingNotification): Promise<boolean> {
		try {
			const result = await execFileAsync(
				this.manifest.systemctlPath,
				["--user", "is-active", pending.unitName],
				{ timeout: 5_000, windowsHide: true, maxBuffer: 64 * 1024 },
			);
			return result.stdout.trim() === "active";
		} catch {
			return false;
		}
	}
}
