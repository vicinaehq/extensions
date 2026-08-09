import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { SCHEMA_VERSION } from "../domain/model";
import type { ReminderPaths } from "../platform/paths";
import { resolveReminderPaths } from "../platform/paths";
import { atomicWriteFile, atomicWriteJson } from "../storage/atomic";
import { ReminderStore } from "../storage/store";
import { renderServiceUnit, renderTimerUnit, SERVICE_NAME, TIMER_NAME } from "./units";

const execFileAsync = promisify(execFile);
export const INFRASTRUCTURE_VERSION = 4;
export const WORKER_VERSION = "1.5.0";

export type InfrastructureManifest = {
	infrastructureVersion: number;
	workerVersion: string;
	schemaVersion: number;
	workerSha256: string;
	notificationIconSha256: string;
	nodePath: string;
	notifySendPath: string;
	systemctlPath: string;
	systemdRunPath: string;
	busctlPath: string;
	notificationCapabilities: string[];
	installedAt: string;
};

type CommandResult = { stdout: string; stderr: string };
export type CommandRunner = (
	file: string,
	args: string[],
	options?: { timeout?: number },
) => Promise<CommandResult>;

export const runCommand: CommandRunner = async (file, args, options = {}) => {
	const result = await execFileAsync(file, args, {
		timeout: options.timeout ?? 15_000,
		windowsHide: true,
		maxBuffer: 1024 * 1024,
	});
	return { stdout: result.stdout, stderr: result.stderr };
};

async function findExecutable(
	name: string,
	candidates: string[],
	runner: CommandRunner,
	validate: (candidate: string) => Promise<void> = async (candidate) => {
		await runner(candidate, ["--version"], { timeout: 5_000 });
	},
): Promise<string> {
	let lastError: string | undefined;
	for (const candidate of [...new Set(candidates)]) {
		if (!path.isAbsolute(candidate)) continue;
		let executableExists = false;
		try {
			await access(candidate, constants.X_OK);
			executableExists = true;
			await validate(candidate);
			return candidate;
		} catch (error) {
			if (executableExists) lastError = error instanceof Error ? error.message : String(error);
		}
	}
	throw new Error(
		`${name} was not found in a compatible executable location${lastError ? `: ${lastError}` : ""}`,
	);
}

function pathCandidates(name: string, env: NodeJS.ProcessEnv): string[] {
	return (env.PATH ?? "")
		.split(path.delimiter)
		.filter((item) => path.isAbsolute(item))
		.map((directory) => path.join(directory, name));
}

export async function findNodeRuntime(
	env: NodeJS.ProcessEnv = process.env,
	runner: CommandRunner = runCommand,
): Promise<string> {
	return findExecutable(
		"Node.js 20 or newer",
		[
			env.VICINAE_REMINDERS_NODE ?? "",
			"/usr/bin/node",
			"/usr/local/bin/node",
			"/usr/bin/vicinae-node",
			"/usr/local/bin/vicinae-node",
			...pathCandidates("node", env),
			...pathCandidates("vicinae-node", env),
		],
		runner,
		async (candidate) => {
			const { stdout } = await runner(candidate, ["--version"], { timeout: 5_000 });
			const major = Number(/^v?(\d+)/.exec(stdout.trim())?.[1]);
			if (!Number.isInteger(major) || major < 20) throw new Error("Node.js is too old");
		},
	);
}

export async function findNotifySend(
	env: NodeJS.ProcessEnv = process.env,
	runner: CommandRunner = runCommand,
): Promise<string> {
	return findExecutable(
		"notify-send",
		[
			env.VICINAE_REMINDERS_NOTIFY_SEND ?? "",
			"/usr/bin/notify-send",
			"/usr/local/bin/notify-send",
			...pathCandidates("notify-send", env),
		],
		runner,
		async (candidate) => {
			await runner(candidate, ["--version"], { timeout: 5_000 });
			const { stdout, stderr } = await runner(candidate, ["--help"], { timeout: 5_000 });
			const help = `${stdout}\n${stderr}`;
			for (const option of ["--action", "--wait", "--expire-time"]) {
				if (!help.includes(option)) throw new Error(`notify-send is missing ${option}`);
			}
		},
	);
}

export async function findSystemctl(
	env: NodeJS.ProcessEnv = process.env,
	runner: CommandRunner = runCommand,
): Promise<string> {
	return findExecutable(
		"systemctl",
		[
			env.VICINAE_REMINDERS_SYSTEMCTL ?? "",
			"/usr/bin/systemctl",
			"/bin/systemctl",
			"/usr/local/bin/systemctl",
			...pathCandidates("systemctl", env),
		],
		runner,
	);
}

async function findSystemdRun(
	env: NodeJS.ProcessEnv = process.env,
	runner: CommandRunner = runCommand,
): Promise<string> {
	return findExecutable(
		"systemd-run",
		[
			env.VICINAE_REMINDERS_SYSTEMD_RUN ?? "",
			"/usr/bin/systemd-run",
			"/bin/systemd-run",
			"/usr/local/bin/systemd-run",
			...pathCandidates("systemd-run", env),
		],
		runner,
	);
}

export async function findBusctl(
	env: NodeJS.ProcessEnv = process.env,
	runner: CommandRunner = runCommand,
): Promise<string> {
	return findExecutable(
		"busctl",
		[
			env.VICINAE_REMINDERS_BUSCTL ?? "",
			"/usr/bin/busctl",
			"/bin/busctl",
			"/usr/local/bin/busctl",
			...pathCandidates("busctl", env),
		],
		runner,
	);
}

export async function findLoginctl(
	env: NodeJS.ProcessEnv = process.env,
	runner: CommandRunner = runCommand,
): Promise<string> {
	return findExecutable(
		"loginctl",
		[
			env.VICINAE_REMINDERS_LOGINCTL ?? "",
			"/usr/bin/loginctl",
			"/bin/loginctl",
			"/usr/local/bin/loginctl",
			...pathCandidates("loginctl", env),
		],
		runner,
	);
}

export async function notificationCapabilities(
	busctlPath: string,
	runner: CommandRunner = runCommand,
): Promise<string[]> {
	let result: CommandResult;
	try {
		result = await runner(
			busctlPath,
			[
				"--user",
				"call",
				"org.freedesktop.Notifications",
				"/org/freedesktop/Notifications",
				"org.freedesktop.Notifications",
				"GetCapabilities",
			],
			{ timeout: 5_000 },
		);
	} catch {
		throw new Error(
			"A running Freedesktop notification service is required in the current graphical session",
		);
	}
	const capabilities = [...result.stdout.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) =>
		match[1].replaceAll('\\"', '"').replaceAll("\\\\", "\\"),
	);
	if (!capabilities.includes("actions")) {
		throw new Error("The current notification service does not support action buttons");
	}
	return capabilities;
}

async function writeIfChanged(
	filePath: string,
	contents: string | Uint8Array,
	mode: number,
): Promise<boolean> {
	try {
		const current = await readFile(filePath);
		const next = typeof contents === "string" ? Buffer.from(contents) : Buffer.from(contents);
		if (current.equals(next)) {
			await chmod(filePath, mode);
			return false;
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	await atomicWriteFile(filePath, contents, mode);
	return true;
}

export type EnsureInfrastructureOptions = {
	workerSourcePath: string;
	iconSourcePath: string;
	paths?: ReminderPaths;
	env?: NodeJS.ProcessEnv;
	runner?: CommandRunner;
};

export async function ensureInfrastructure(
	options: EnsureInfrastructureOptions,
): Promise<InfrastructureManifest> {
	const paths = options.paths ?? resolveReminderPaths(options.env);
	const env = options.env ?? process.env;
	const runner = options.runner ?? runCommand;
	const store = new ReminderStore(paths);
	await store.ensureDirectories();
	await store.migrate();
	await mkdir(paths.unitDir, { recursive: true, mode: 0o700 });

	const [
		nodePath,
		notifySendPath,
		systemctlPath,
		systemdRunPath,
		busctlPath,
		workerBytes,
		notificationIconBytes,
	] = await Promise.all([
		findNodeRuntime(env, runner),
		findNotifySend(env, runner),
		findSystemctl(env, runner),
		findSystemdRun(env, runner),
		findBusctl(env, runner),
		readFile(options.workerSourcePath),
		readFile(options.iconSourcePath),
	]);
	try {
		await runner(systemctlPath, ["--user", "show-environment"], { timeout: 5_000 });
	} catch {
		throw new Error(
			"A running systemd user manager is required; log in through a systemd-managed graphical session",
		);
	}
	const capabilities = await notificationCapabilities(busctlPath, runner);
	const workerSha256 = createHash("sha256").update(workerBytes).digest("hex");
	const notificationIconSha256 = createHash("sha256").update(notificationIconBytes).digest("hex");
	const service = renderServiceUnit({
		nodePath,
		workerPath: paths.workerPath,
		notificationIconPath: paths.notificationIconPath,
		notifySendPath,
		dataDir: paths.dataDir,
		stateDir: paths.stateDir,
	});
	const timer = renderTimerUnit();

	const workerChanged = await writeIfChanged(paths.workerPath, workerBytes, 0o755);
	await writeIfChanged(paths.notificationIconPath, notificationIconBytes, 0o644);
	const manifest: InfrastructureManifest = {
		infrastructureVersion: INFRASTRUCTURE_VERSION,
		workerVersion: WORKER_VERSION,
		schemaVersion: SCHEMA_VERSION,
		workerSha256,
		notificationIconSha256,
		nodePath,
		notifySendPath,
		systemctlPath,
		systemdRunPath,
		busctlPath,
		notificationCapabilities: capabilities,
		installedAt: new Date().toISOString(),
	};
	let existingManifest: InfrastructureManifest | undefined;
	try {
		existingManifest = JSON.parse(await readFile(paths.infrastructureManifestPath, "utf8"));
	} catch {
		existingManifest = undefined;
	}
	if (
		workerChanged ||
		!existingManifest ||
		existingManifest.infrastructureVersion !== manifest.infrastructureVersion ||
		existingManifest.workerVersion !== manifest.workerVersion ||
		existingManifest.schemaVersion !== manifest.schemaVersion ||
		existingManifest.workerSha256 !== manifest.workerSha256 ||
		existingManifest.notificationIconSha256 !== manifest.notificationIconSha256 ||
		existingManifest.nodePath !== manifest.nodePath ||
		existingManifest.notifySendPath !== manifest.notifySendPath ||
		existingManifest.systemctlPath !== manifest.systemctlPath ||
		existingManifest.systemdRunPath !== manifest.systemdRunPath ||
		existingManifest.busctlPath !== manifest.busctlPath ||
		JSON.stringify(existingManifest.notificationCapabilities) !==
			JSON.stringify(manifest.notificationCapabilities)
	) {
		await atomicWriteJson(paths.infrastructureManifestPath, manifest);
	} else {
		manifest.installedAt = existingManifest.installedAt;
	}

	await runner(nodePath, [paths.workerPath, "--version"], { timeout: 10_000 });
	const serviceChanged = await writeIfChanged(paths.servicePath, service, 0o644);
	const timerChanged = await writeIfChanged(paths.timerPath, timer, 0o644);
	if (serviceChanged || timerChanged) await runner(systemctlPath, ["--user", "daemon-reload"]);
	await runner(systemctlPath, ["--user", "enable", "--now", TIMER_NAME]);
	if (serviceChanged || timerChanged) {
		await runner(systemctlPath, ["--user", "restart", TIMER_NAME]);
	}
	const enabled = await runner(systemctlPath, ["--user", "is-enabled", TIMER_NAME]);
	const active = await runner(systemctlPath, ["--user", "is-active", TIMER_NAME]);
	if (enabled.stdout.trim() !== "enabled" || active.stdout.trim() !== "active") {
		throw new Error(
			`Reminder timer is not healthy (enabled=${enabled.stdout.trim()}, active=${active.stdout.trim()})`,
		);
	}
	return manifest;
}

async function installedSystemctlPath(
	paths: ReminderPaths,
	runner: CommandRunner,
): Promise<string> {
	try {
		const manifest = JSON.parse(
			await readFile(paths.infrastructureManifestPath, "utf8"),
		) as Partial<InfrastructureManifest>;
		if (manifest.systemctlPath && path.isAbsolute(manifest.systemctlPath)) {
			await access(manifest.systemctlPath, constants.X_OK);
			await runner(manifest.systemctlPath, ["--version"], { timeout: 5_000 });
			return manifest.systemctlPath;
		}
	} catch {
		// Fall back to discovery for pre-v4 or missing infrastructure metadata.
	}
	return findSystemctl(process.env, runner);
}

export async function cleanupInfrastructure(
	paths = resolveReminderPaths(),
	runner: CommandRunner = runCommand,
): Promise<void> {
	const systemctlPath = await installedSystemctlPath(paths, runner);
	try {
		const helpers = await runner(systemctlPath, [
			"--user",
			"list-units",
			"--type=service",
			"--all",
			"--plain",
			"--no-legend",
			"vicinae-reminder-notification-*.service",
		]);
		const unitNames = helpers.stdout
			.split("\n")
			.map((line) => line.trim().split(/\s+/, 1)[0])
			.filter((name) => /^vicinae-reminder-notification-[0-9a-f-]+\.service$/.test(name));
		if (unitNames.length > 0) {
			await runner(systemctlPath, ["--user", "stop", ...unitNames]).catch(() => undefined);
			await runner(systemctlPath, ["--user", "reset-failed", ...unitNames]).catch(() => undefined);
		}
	} catch {
		// Continue removing the permanent infrastructure even if helper discovery fails.
	}
	await runner(systemctlPath, ["--user", "disable", "--now", TIMER_NAME]).catch(() => undefined);
	await runner(systemctlPath, ["--user", "stop", SERVICE_NAME]).catch(() => undefined);
	await runner(systemctlPath, ["--user", "clean", "--what=state", TIMER_NAME]).catch(
		() => undefined,
	);
	await rm(paths.servicePath, { force: true });
	await rm(paths.timerPath, { force: true });
	await rm(paths.workerPath, { force: true });
	await rm(paths.notificationIconPath, { force: true });
	await rm(paths.infrastructureManifestPath, { force: true });
	await rm(path.join(path.dirname(paths.dataDir), "systemd", "timers", `stamp-${TIMER_NAME}`), {
		force: true,
	});
	await runner(systemctlPath, ["--user", "daemon-reload"]);
	await runner(systemctlPath, ["--user", "reset-failed", SERVICE_NAME, TIMER_NAME]).catch(
		() => undefined,
	);
}

export async function stopNotificationHelper(
	unitName: string | undefined,
	runner: CommandRunner = runCommand,
	paths = resolveReminderPaths(),
): Promise<void> {
	if (!unitName) return;
	if (!/^vicinae-reminder-notification-[0-9a-f-]+\.service$/.test(unitName)) {
		throw new Error("Invalid notification helper unit name");
	}
	const systemctlPath = await installedSystemctlPath(paths, runner);
	await runner(systemctlPath, ["--user", "stop", unitName]).catch(() => undefined);
	await runner(systemctlPath, ["--user", "reset-failed", unitName]).catch(() => undefined);
}
