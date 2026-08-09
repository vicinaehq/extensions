import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { SCHEMA_VERSION } from "../domain/model";
import type { ReminderPaths } from "../platform/paths";
import { resolveReminderPaths } from "../platform/paths";
import { atomicWriteFile, atomicWriteJson } from "../storage/atomic";
import { ReminderStore } from "../storage/store";

const execFileAsync = promisify(execFile);
const LEGACY_SERVICE_NAME = "vicinae-reminders.service";
const LEGACY_TIMER_NAME = "vicinae-reminders.timer";

export const INFRASTRUCTURE_VERSION = 5;
export const WORKER_VERSION = "1.6.0";

export type InfrastructureManifest = {
	infrastructureVersion: number;
	workerVersion: string;
	schemaVersion: number;
	workerSourcePath: string;
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

async function readManifest(paths: ReminderPaths): Promise<InfrastructureManifest | undefined> {
	try {
		return JSON.parse(await readFile(paths.infrastructureManifestPath, "utf8"));
	} catch {
		return undefined;
	}
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function removeLegacyScheduler(
	paths: ReminderPaths,
	systemctlPath: string,
	runner: CommandRunner,
	force = false,
): Promise<void> {
	const hasLegacyFiles =
		force ||
		(
			await Promise.all([
				fileExists(paths.servicePath),
				fileExists(paths.timerPath),
				fileExists(paths.workerPath),
			])
		).some(Boolean);
	if (!hasLegacyFiles) return;
	await runner(systemctlPath, ["--user", "disable", "--now", LEGACY_TIMER_NAME]).catch(
		() => undefined,
	);
	await runner(systemctlPath, ["--user", "stop", LEGACY_SERVICE_NAME]).catch(() => undefined);
	await runner(systemctlPath, ["--user", "clean", "--what=state", LEGACY_TIMER_NAME]).catch(
		() => undefined,
	);
	await rm(paths.servicePath, { force: true });
	await rm(paths.timerPath, { force: true });
	await rm(paths.workerPath, { force: true });
	await runner(systemctlPath, ["--user", "daemon-reload"]);
	await runner(systemctlPath, [
		"--user",
		"reset-failed",
		LEGACY_SERVICE_NAME,
		LEGACY_TIMER_NAME,
	]).catch(() => undefined);
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

	const existingManifest = await readManifest(paths);
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
	const notificationCapabilitiesValue = await notificationCapabilities(busctlPath, runner);
	await removeLegacyScheduler(
		paths,
		systemctlPath,
		runner,
		Boolean(existingManifest && existingManifest.infrastructureVersion < INFRASTRUCTURE_VERSION),
	);

	const workerSha256 = createHash("sha256").update(workerBytes).digest("hex");
	const notificationIconSha256 = createHash("sha256").update(notificationIconBytes).digest("hex");
	await writeIfChanged(paths.notificationIconPath, notificationIconBytes, 0o644);
	const manifest: InfrastructureManifest = {
		infrastructureVersion: INFRASTRUCTURE_VERSION,
		workerVersion: WORKER_VERSION,
		schemaVersion: SCHEMA_VERSION,
		workerSourcePath: options.workerSourcePath,
		workerSha256,
		notificationIconSha256,
		nodePath,
		notifySendPath,
		systemctlPath,
		systemdRunPath,
		busctlPath,
		notificationCapabilities: notificationCapabilitiesValue,
		installedAt: new Date().toISOString(),
	};
	if (
		existingManifest &&
		JSON.stringify({ ...existingManifest, installedAt: manifest.installedAt }) ===
			JSON.stringify(manifest)
	) {
		manifest.installedAt = existingManifest.installedAt;
	} else {
		await atomicWriteJson(paths.infrastructureManifestPath, manifest);
	}
	await runner(nodePath, [options.workerSourcePath, "--version"], { timeout: 10_000 });
	return manifest;
}

export async function loadInfrastructure(
	options: EnsureInfrastructureOptions,
): Promise<InfrastructureManifest> {
	const paths = options.paths ?? resolveReminderPaths(options.env);
	const manifest = await readManifest(paths);
	if (
		manifest?.infrastructureVersion === INFRASTRUCTURE_VERSION &&
		manifest.workerVersion === WORKER_VERSION &&
		manifest.schemaVersion === SCHEMA_VERSION &&
		manifest.workerSourcePath === options.workerSourcePath &&
		path.isAbsolute(manifest.workerSourcePath)
	) {
		try {
			const [workerBytes, installedIconBytes, sourceIconBytes] = await Promise.all([
				readFile(options.workerSourcePath),
				readFile(paths.notificationIconPath),
				readFile(options.iconSourcePath),
			]);
			if (
				createHash("sha256").update(workerBytes).digest("hex") === manifest.workerSha256 &&
				createHash("sha256").update(installedIconBytes).digest("hex") ===
					manifest.notificationIconSha256 &&
				createHash("sha256").update(sourceIconBytes).digest("hex") ===
					manifest.notificationIconSha256
			) {
				return manifest;
			}
		} catch {
			// Rebuild missing or changed runtime metadata below.
		}
	}
	return ensureInfrastructure(options);
}

async function installedSystemctlPath(
	paths: ReminderPaths,
	runner: CommandRunner,
): Promise<string> {
	const manifest = await readManifest(paths);
	if (manifest?.systemctlPath && path.isAbsolute(manifest.systemctlPath)) {
		try {
			await access(manifest.systemctlPath, constants.X_OK);
			return manifest.systemctlPath;
		} catch {
			// Fall through to discovery.
		}
	}
	return findSystemctl(process.env, runner);
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
