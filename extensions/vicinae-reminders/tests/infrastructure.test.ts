import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { newReminder } from "../src/domain/model";
import {
	type CommandRunner,
	ensureInfrastructure,
	findBusctl,
	findNodeRuntime,
	findNotifySend,
	findSystemctl,
	loadInfrastructure,
	notificationCapabilities,
} from "../src/infrastructure/infrastructure";
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

	it("continues past an old candidate", async () => {
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
	it("requires action and wait support", async () => {
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

	it("continues past an incompatible client", async () => {
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
	it("uses executable paths supplied by the environment", async () => {
		const directory = await temporaryDirectory();
		const systemctl = await executable(directory, "systemctl");
		const busctl = await executable(directory, "busctl");
		const runner: CommandRunner = async () => ({ stdout: "systemd 255\n", stderr: "" });
		expect(await findSystemctl({ VICINAE_REMINDERS_SYSTEMCTL: systemctl }, runner)).toBe(systemctl);
		expect(await findBusctl({ VICINAE_REMINDERS_BUSCTL: busctl }, runner)).toBe(busctl);
	});

	it("requires a notification service with action support", async () => {
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

async function infrastructureFixture() {
	const root = await temporaryDirectory();
	const paths = reminderPathsFromDirectories(path.join(root, "data"), path.join(root, "state"));
	const node = await executable(root, "node");
	const notifySend = await executable(root, "notify-send");
	const systemctl = await executable(root, "systemctl");
	const systemdRun = await executable(root, "systemd-run");
	const busctl = await executable(root, "busctl");
	const workerSource = path.join(root, "worker.cjs");
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
		if (file === node && args[0] === workerSource)
			return { stdout: "vicinae-reminders-worker 1.6.0\n", stderr: "" };
		return { stdout: "", stderr: "" };
	};
	const options = {
		workerSourcePath: workerSource,
		iconSourcePath: iconSource,
		paths,
		env: {
			VICINAE_REMINDERS_NODE: node,
			VICINAE_REMINDERS_NOTIFY_SEND: notifySend,
			VICINAE_REMINDERS_SYSTEMCTL: systemctl,
			VICINAE_REMINDERS_SYSTEMD_RUN: systemdRun,
			VICINAE_REMINDERS_BUSCTL: busctl,
		},
		runner,
	};
	return { root, paths, workerSource, iconSource, systemctl, calls, options };
}

describe("ensureInfrastructure", () => {
	it("stores metadata and the icon without copying a permanent worker", async () => {
		const fixture = await infrastructureFixture();
		const first = await ensureInfrastructure(fixture.options);
		expect(first.workerSourcePath).toBe(fixture.workerSource);
		expect(await readFile(fixture.paths.notificationIconPath, "utf8")).toBe("icon-one");
		await expect(readFile(fixture.paths.workerPath)).rejects.toMatchObject({ code: "ENOENT" });
		await expect(readFile(fixture.paths.servicePath)).rejects.toMatchObject({ code: "ENOENT" });
		await expect(readFile(fixture.paths.timerPath)).rejects.toMatchObject({ code: "ENOENT" });

		const callCount = fixture.calls.length;
		const cached = await loadInfrastructure(fixture.options);
		expect(cached).toEqual(first);
		expect(fixture.calls).toHaveLength(callCount);

		await writeFile(fixture.iconSource, "icon-two");
		const updated = await ensureInfrastructure(fixture.options);
		expect(updated.notificationIconSha256).not.toBe(first.notificationIconSha256);
		expect(await readFile(fixture.paths.notificationIconPath, "utf8")).toBe("icon-two");
	});

	it("removes legacy units and worker while preserving reminder data", async () => {
		const fixture = await infrastructureFixture();
		const reminder = newReminder("keep me", new Date(Date.now() + 60_000));
		await new ReminderStore(fixture.paths).create(reminder);
		await writeFile(fixture.paths.servicePath, "legacy service");
		await writeFile(fixture.paths.timerPath, "legacy timer");
		await writeFile(fixture.paths.workerPath, "legacy worker");
		await writeFile(
			fixture.paths.infrastructureManifestPath,
			JSON.stringify({ infrastructureVersion: 4 }),
		);

		await ensureInfrastructure(fixture.options);
		expect(await new ReminderStore(fixture.paths).get(reminder.id)).toEqual(reminder);
		for (const file of [
			fixture.paths.servicePath,
			fixture.paths.timerPath,
			fixture.paths.workerPath,
		]) {
			await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
		}
		expect(
			fixture.calls.some(
				(call) => call.file === fixture.systemctl && call.args.includes("disable"),
			),
		).toBe(true);
		expect(fixture.calls.some((call) => call.args.includes("daemon-reload"))).toBe(true);
	});
});
