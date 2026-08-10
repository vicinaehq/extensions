import type { EnsureInfrastructureOptions } from "../infrastructure/infrastructure";
import { loadInfrastructure, WORKER_VERSION } from "../infrastructure/infrastructure";
import { resolveReminderPaths } from "../platform/paths";
import { atomicWriteJson } from "../storage/atomic";
import { ReminderStore } from "../storage/store";
import { SystemdNotificationDispatcher } from "./notification-dispatcher";
import { processDueReminders, type WorkerRunResult } from "./processor";

export async function runReminderCheck(
	options: EnsureInfrastructureOptions & { now?: () => Date },
): Promise<WorkerRunResult> {
	const paths = options.paths ?? resolveReminderPaths(options.env);
	try {
		const manifest = await loadInfrastructure(options);
		const result = await processDueReminders(
			new ReminderStore(paths),
			new SystemdNotificationDispatcher(paths, manifest),
			{ now: options.now },
		);
		await atomicWriteJson(paths.workerStatusPath, {
			workerVersion: WORKER_VERSION,
			ok: result.failedCount === 0,
			error: result.outcomes.find((item) => item.status === "failed")?.error,
			...result,
		});
		return result;
	} catch (error) {
		await atomicWriteJson(paths.workerStatusPath, {
			workerVersion: WORKER_VERSION,
			finishedAt: new Date().toISOString(),
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}
