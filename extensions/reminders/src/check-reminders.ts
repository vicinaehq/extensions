import path from "node:path";
import { environment, type LaunchProps, LaunchType, showHUD } from "@vicinae/api";
import { notificationIconSourcePath } from "./ui/notification-icon";
import { runReminderCheck } from "./worker/check";

export default async function CheckReminders(props: LaunchProps) {
	const result = await runReminderCheck({
		workerSourcePath: path.join(environment.assetsPath, "worker.cjs"),
		iconSourcePath: notificationIconSourcePath(),
	});
	if (props.launchType !== LaunchType.Background) {
		await showHUD(
			result.dueCount === 0
				? "No reminders due"
				: `Checked ${result.dueCount} due reminder${result.dueCount === 1 ? "" : "s"}`,
		);
	}
}
