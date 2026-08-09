import os from "node:os";
import path from "node:path";

export type ReminderPaths = {
	dataDir: string;
	remindersDir: string;
	runtimeDir: string;
	workerPath: string;
	notificationIconPath: string;
	infrastructureManifestPath: string;
	stateDir: string;
	workerStatusPath: string;
	configDir: string;
	unitDir: string;
	servicePath: string;
	timerPath: string;
};

function xdgPath(value: string | undefined, fallback: string): string {
	return value && path.isAbsolute(value) ? value : fallback;
}

export function resolveReminderPaths(
	env: NodeJS.ProcessEnv = process.env,
	home = env.HOME || os.homedir(),
): ReminderPaths {
	const dataHome = xdgPath(env.XDG_DATA_HOME, path.join(home, ".local", "share"));
	const configHome = xdgPath(env.XDG_CONFIG_HOME, path.join(home, ".config"));
	const stateHome = xdgPath(env.XDG_STATE_HOME, path.join(home, ".local", "state"));
	const dataDir = path.join(dataHome, "vicinae-reminders");
	const runtimeDir = path.join(dataDir, "runtime");
	const stateDir = path.join(stateHome, "vicinae-reminders");
	const unitDir = path.join(configHome, "systemd", "user");
	return {
		dataDir,
		remindersDir: path.join(dataDir, "reminders"),
		runtimeDir,
		workerPath: path.join(runtimeDir, "worker.cjs"),
		notificationIconPath: path.join(runtimeDir, "icon.png"),
		infrastructureManifestPath: path.join(runtimeDir, "infrastructure.json"),
		stateDir,
		workerStatusPath: path.join(stateDir, "worker-status.json"),
		configDir: path.join(configHome, "vicinae-reminders"),
		unitDir,
		servicePath: path.join(unitDir, "vicinae-reminders.service"),
		timerPath: path.join(unitDir, "vicinae-reminders.timer"),
	};
}

export function reminderPathsFromDirectories(dataDir: string, stateDir: string): ReminderPaths {
	const defaults = resolveReminderPaths();
	const runtimeDir = path.join(dataDir, "runtime");
	return {
		...defaults,
		dataDir,
		remindersDir: path.join(dataDir, "reminders"),
		runtimeDir,
		workerPath: path.join(runtimeDir, "worker.cjs"),
		notificationIconPath: path.join(runtimeDir, "icon.png"),
		infrastructureManifestPath: path.join(runtimeDir, "infrastructure.json"),
		stateDir,
		workerStatusPath: path.join(stateDir, "worker-status.json"),
	};
}
