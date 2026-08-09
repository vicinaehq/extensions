import { WORKER_VERSION } from "./infrastructure/infrastructure";
import { reminderPathsFromDirectories, resolveReminderPaths } from "./platform/paths";
import { ReminderStore } from "./storage/store";
import { runNotificationHelper } from "./worker/notification-actions";
import { NotifySendNotifier } from "./worker/notifier";

function argumentValue(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
	if (process.argv.includes("--version")) {
		process.stdout.write(`vicinae-reminders-worker ${WORKER_VERSION}\n`);
		return;
	}
	const defaults = resolveReminderPaths();
	const dataDir = argumentValue("--data-dir") ?? defaults.dataDir;
	const stateDir = argumentValue("--state-dir") ?? defaults.stateDir;
	const notifySend = argumentValue("--notify-send");
	const extensionMarker = argumentValue("--extension-marker");
	const paths = reminderPathsFromDirectories(dataDir, stateDir);
	const notificationIcon = argumentValue("--icon") ?? paths.notificationIconPath;
	const store = new ReminderStore(paths);
	await store.ensureDirectories();
	if (!process.argv.includes("--notification-helper"))
		throw new Error("This worker only handles active reminder notifications");
	const reminderId = argumentValue("--reminder-id");
	const token = argumentValue("--token");
	if (!reminderId || !token || !notifySend || !extensionMarker)
		throw new Error("Notification helper arguments are incomplete");
	await runNotificationHelper(
		store,
		new NotifySendNotifier(notifySend, undefined, notificationIcon, extensionMarker),
		reminderId,
		token,
	);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
