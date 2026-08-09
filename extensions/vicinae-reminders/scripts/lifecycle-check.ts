import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { renderServiceUnit, renderTimerUnit } from "../src/infrastructure/units";

const run = promisify(execFile);

async function command(file: string, args: string[]): Promise<string> {
	const result = await run(file, args, { timeout: 15_000 });
	return result.stdout.trim();
}

async function main(): Promise<void> {
	const systemctl = process.env.VICINAE_REMINDERS_SYSTEMCTL ?? "systemctl";
	const systemdAnalyze = process.env.VICINAE_REMINDERS_SYSTEMD_ANALYZE ?? "systemd-analyze";
	const notifySend = process.env.VICINAE_REMINDERS_NOTIFY_SEND ?? "notify-send";
	const root = await mkdtemp(path.join(os.tmpdir(), "vicinae-reminders-lifecycle-"));
	const suffix = `${process.pid}-${Date.now()}`;
	const serviceName = `vicinae-reminders-check-${suffix}.service`;
	const timerName = `vicinae-reminders-check-${suffix}.timer`;
	const servicePath = path.join(root, serviceName);
	const timerPath = path.join(root, timerName);
	const workerPath = path.join(root, "smoke-worker.mjs");
	const uid = typeof process.getuid === "function" ? process.getuid() : 0;
	const runtimeUnitDir = path.join(
		process.env.XDG_RUNTIME_DIR ?? `/run/user/${uid}`,
		"systemd",
		"user",
	);
	const persistentTimerDir = path.join(
		process.env.XDG_DATA_HOME ?? path.join(process.env.HOME ?? os.homedir(), ".local", "share"),
		"systemd",
		"timers",
	);
	try {
		await writeFile(workerPath, "process.exit(0);\n", { mode: 0o755 });
		await writeFile(
			servicePath,
			renderServiceUnit({
				nodePath: process.execPath,
				workerPath,
				notificationIconPath: path.join(root, "icon.png"),
				notifySendPath: notifySend,
				dataDir: path.join(root, "data with spaces"),
				stateDir: path.join(root, "state"),
			}),
		);
		await writeFile(timerPath, renderTimerUnit(serviceName));
		await command(systemdAnalyze, ["--user", "verify", servicePath, timerPath]);
		await command(systemctl, ["--user", "link", "--runtime", servicePath, timerPath]);
		await command(systemctl, ["--user", "daemon-reload"]);
		await command(systemctl, ["--user", "enable", "--runtime", "--now", timerName]);
		if ((await command(systemctl, ["--user", "is-active", timerName])) !== "active") {
			throw new Error("Smoke timer did not become active");
		}
		await command(systemctl, ["--user", "start", serviceName]);
		const result = await command(systemctl, [
			"--user",
			"show",
			serviceName,
			"--property=Result",
			"--value",
		]);
		if (result !== "success") throw new Error(`Smoke worker result was ${result}`);
		process.stdout.write(
			`Verified ${serviceName} and ${timerName}: timer active, oneshot result success\n`,
		);
	} finally {
		await command(systemctl, ["--user", "disable", "--runtime", "--now", timerName]).catch(
			() => undefined,
		);
		await command(systemctl, ["--user", "stop", serviceName]).catch(() => undefined);
		await command(systemctl, ["--user", "clean", "--what=state", timerName]).catch(() => undefined);
		await rm(path.join(runtimeUnitDir, timerName), { force: true });
		await rm(path.join(runtimeUnitDir, serviceName), { force: true });
		await rm(path.join(persistentTimerDir, `stamp-${timerName}`), { force: true });
		await command(systemctl, ["--user", "daemon-reload"]).catch(() => undefined);
		await command(systemctl, ["--user", "reset-failed", serviceName, timerName]).catch(
			() => undefined,
		);
		await rm(root, { recursive: true, force: true });
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
