import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { newReminder } from "../src/domain/model";
import {
	type CommandRunner,
	cleanupInfrastructure,
	ensureInfrastructure,
	findBusctl,
	findNodeRuntime,
	findNotifySend,
	findSystemctl,
	notificationCapabilities,
} from "../src/infrastructure/infrastructure";
import { renderServiceUnit, renderTimerUnit } from "../src/infrastructure/units";
import { reminderPathsFromDirectories } from "../src/platform/paths";
import { ReminderStore } from "../src/storage/store";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

async function temporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(path.join(os.tmpdir(), "vicinae-infrastructure-"));
	temporaryDirectories.push(directory);
	return directory;
}

async function executable(directory: string, name: string): Promise<string> {
	const file = path.join(directory, name);
	await writeFile(file, "#!/bin/sh\nexit 0\n");
	await chmod(file, 0o755);
	return file;
}

describe("systemd units", () => {
	it("quotes paths containing spaces, %, quotes, and backslashes without shell interpolation", () => {
		const unit = renderServiceUnit({
			nodePath: `/tmp/node path/100%/it's\\node`,
			workerPath: `/tmp/worker path/worker.mjs`,
			notificationIconPath: `/tmp/icon path/100%/icon.png`,
			notifySendPath: `/opt/notify"send/bin`,
			dataDir: `/tmp/data;$(touch /tmp/pwned)`,
			stateDir: `/tmp/state\\dir`,
		});
		const execStart = unit.split("\n").find((line) => line.startsWith("ExecStart="));
		expect(execStart).toBe(
			`ExecStart="/tmp/node path/100%%/it's\\\\node" "/tmp/worker path/worker.mjs" "--data-dir" "/tmp/data;$(touch /tmp/pwned)" "--state-dir" "/tmp/state\\\\dir" "--notify-send" "/opt/notify\\"send/bin" "--icon" "/tmp/icon path/100%%/icon.png"`,
		);
		expect(unit).not.toContain("'$(");
	});

	it("renders timer scheduling and safety-critical fields", () => {
		const timer = renderTimerUnit();
		expect(timer).toContain("OnCalendar=*-*-* *:*:00");
		expect(timer).toContain("AccuracySec=1s");
		expect(timer).toContain("RandomizedDelaySec=0");
		expect(timer).toContain("Persistent=true");
		expect(timer).toContain("Unit=vicinae-reminders.service");
	});
});

describe("findNodeRuntime", () => {
	it("rejects an injected Node runtime older than 20", async () => {
		const directory = await temporaryDirectory();
		const node = await executable(directory, "node");
		const runner: CommandRunner = async () => ({ stdout: "v18.19.0\n", stderr: "" });
		await expect(findNodeRuntime({ VICINAE_REMINDERS_NODE: node }, runner)).rejects.toThrow(
			"Node.js 20 or newer",
		);
	});

	it("accepts an injected Node runtime at version 20", async () => {
		const directory = await temporaryDirectory();
		const node = await executable(directory, "node");
		const runner: CommandRunner = async () => ({ stdout: "v20.11.1\n", stderr: "" });
		expect(await findNodeRuntime({ VICINAE_REMINDERS_NODE: node }, runner)).toBe(node);
	});

	it("continues past an old candidate and selects a later compatible runtime", async () => {
		const directory = await temporaryDirectory();
		const oldNode = await executable(directory, "old-node");
		const currentNode = await executable(directory, "node");
		const runner: CommandRunner = async (file) => ({
			stdout: file === currentNode ? "v22.4.0\n" : "v18.20.0\n",
			stderr: "",
		});
		expect(
			await findNodeRuntime({ VICINAE_REMINDERS_NODE: oldNode, PATH: directory }, runner),
		).toBe(currentNode);
	});
});

describe("findNotifySend", () => {
	it("requires the portable wait and action options", async () => {
		const directory = await temporaryDirectory();
		const notifySend = await executable(directory, "notify-send");
		const runner: CommandRunner = async (_file, args) => ({
			stdout: args[0] === "--help" ? "--wait --expire-time" : "notify-send 0.7.9",
			stderr: "",
		});
		await expect(
			findNotifySend({ VICINAE_REMINDERS_NOTIFY_SEND: notifySend }, runner),
		).rejects.toThrow("--action");
	});

	it("continues past an incompatible client and selects a capable one", async () => {
		const directory = await temporaryDirectory();
		const oldNotifySend = await executable(directory, "old-notify-send");
		const notifySend = await executable(directory, "notify-send");
		const runner: CommandRunner = async (file, args) => ({
			stdout:
				args[0] === "--help"
					? file === notifySend
						? "--action --wait --expire-time"
						: "--expire-time"
					: "notify-send 0.8.0",
			stderr: "",
		});
		expect(
			await findNotifySend(
				{ VICINAE_REMINDERS_NOTIFY_SEND: oldNotifySend, PATH: directory },
				runner,
			),
		).toBe(notifySend);
	});
});

describe("system service discovery", () => {
	it("uses non-FHS systemctl and busctl paths supplied by the environment", async () => {
		const directory = await temporaryDirectory();
		const systemctl = await executable(directory, "systemctl");
		const busctl = await executable(directory, "busctl");
		const runner: CommandRunner = async () => ({ stdout: "systemd 255\n", stderr: "" });
		expect(await findSystemctl({ VICINAE_REMINDERS_SYSTEMCTL: systemctl }, runner)).toBe(systemctl);
		expect(await findBusctl({ VICINAE_REMINDERS_BUSCTL: busctl }, runner)).toBe(busctl);
	});

	it("requires a live notification service with action support", async () => {
		const runner: CommandRunner = async () => ({
			stdout: 'as 3 "actions" "body" "persistence"\n',
			stderr: "",
		});
		expect(await notificationCapabilities("/custom/busctl", runner)).toEqual([
			"actions",
			"body",
			"persistence",
		]);
		await expect(
			notificationCapabilities("/custom/busctl", async () => ({
				stdout: 'as 1 "body"\n',
				stderr: "",
			})),
		).rejects.toThrow("does not support action buttons");
	});
});

describe("ensureInfrastructure and cleanupInfrastructure", () => {
	it("is idempotent, upgrades changed workers, and preserves reminder data on cleanup", async () => {
		const root = await temporaryDirectory();
		const dataDir = path.join(root, "data");
		const stateDir = path.join(root, "state");
		const paths = reminderPathsFromDirectories(dataDir, stateDir);
		const node = await executable(root, "node");
		const notifySend = await executable(root, "notify-send");
		const systemctl = await executable(root, "systemctl");
		const systemdRun = await executable(root, "systemd-run");
		const busctl = await executable(root, "busctl");
		const workerSource = path.join(root, "worker.mjs");
		const iconSource = path.join(root, "icon.png");
		await writeFile(workerSource, "#!/usr/bin/env node\nconsole.log('one')\n");
		await writeFile(iconSource, "icon-one");
		const calls: Array<{ file: string; args: string[] }> = [];
		const runner: CommandRunner = async (file, args) => {
			calls.push({ file, args });
			if (file === node && args[0] === "--version") return { stdout: "v20.12.0\n", stderr: "" };
			if (file === notifySend && args[0] === "--help")
				return { stdout: "--action --wait --expire-time\n", stderr: "" };
			if (file === busctl && args.includes("GetCapabilities"))
				return { stdout: 'as 2 "actions" "body"\n', stderr: "" };
			if (file === node && args[0] === paths.workerPath)
				return { stdout: "worker 1.0.0\n", stderr: "" };
			if (file === systemctl && args.includes("is-enabled"))
				return { stdout: "enabled\n", stderr: "" };
			if (file === systemctl && args.includes("is-active"))
				return { stdout: "active\n", stderr: "" };
			return { stdout: "", stderr: "" };
		};
		const env = {
			VICINAE_REMINDERS_NODE: node,
			VICINAE_REMINDERS_NOTIFY_SEND: notifySend,
			VICINAE_REMINDERS_SYSTEMCTL: systemctl,
			VICINAE_REMINDERS_SYSTEMD_RUN: systemdRun,
			VICINAE_REMINDERS_BUSCTL: busctl,
		};
		const first = await ensureInfrastructure({
			workerSourcePath: workerSource,
			iconSourcePath: iconSource,
			paths,
			env,
			runner,
		});
		const firstCallCount = calls.length;
		const firstService = await readFile(paths.servicePath, "utf8");
		const second = await ensureInfrastructure({
			workerSourcePath: workerSource,
			iconSourcePath: iconSource,
			paths,
			env,
			runner,
		});
		expect(second.installedAt).toBe(first.installedAt);
		expect(calls.slice(firstCallCount).some((call) => call.args.includes("daemon-reload"))).toBe(
			false,
		);
		expect(calls.slice(firstCallCount).some((call) => call.args.includes("restart"))).toBe(false);
		await writeFile(iconSource, "icon-two");
		const iconUpdated = await ensureInfrastructure({
			workerSourcePath: workerSource,
			iconSourcePath: iconSource,
			paths,
			env,
			runner,
		});
		expect(iconUpdated.notificationIconSha256).not.toBe(first.notificationIconSha256);
		expect(await readFile(paths.notificationIconPath, "utf8")).toBe("icon-two");
		await writeFile(workerSource, "#!/usr/bin/env node\nconsole.log('two')\n");
		const upgraded = await ensureInfrastructure({
			workerSourcePath: workerSource,
			iconSourcePath: iconSource,
			paths,
			env,
			runner,
		});
		expect(calls.some((call) => call.args.includes("restart"))).toBe(true);
		expect(await readFile(paths.servicePath, "utf8")).toBe(firstService);
		expect(upgraded.workerSha256).not.toBe(first.workerSha256);
		expect(upgraded.systemctlPath).toBe(systemctl);
		expect(upgraded.notificationCapabilities).toContain("actions");
		expect(await readFile(paths.notificationIconPath, "utf8")).toBe("icon-two");

		const reminder = newReminder("keep me", new Date(Date.now() + 60_000));
		await new ReminderStore(paths).create(reminder);
		await cleanupInfrastructure(paths, runner);
		expect(await new ReminderStore(paths).get(reminder.id)).toEqual(reminder);
		await expect(readFile(paths.notificationIconPath)).rejects.toMatchObject({ code: "ENOENT" });
	});
});
