import { constants } from "node:fs";
import { mkdir, open, readdir, rm } from "node:fs/promises";
import path from "node:path";
import lockfile from "proper-lockfile";
import { isReminderId, parseReminderDocument, type Reminder } from "../domain/model";
import type { ReminderPaths } from "../platform/paths";
import { resolveReminderPaths } from "../platform/paths";
import { atomicWriteJson } from "./atomic";

type CorruptReminder = { file: string; error: string };
export type ReminderScan = {
	reminders: Reminder[];
	corrupt: CorruptReminder[];
	migratedCount: number;
};

export class ReminderConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ReminderConflictError";
	}
}

async function readNoFollow(filePath: string): Promise<string> {
	const handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		return await handle.readFile("utf8");
	} finally {
		await handle.close();
	}
}

export class ReminderStore {
	readonly paths: ReminderPaths;

	constructor(paths = resolveReminderPaths()) {
		this.paths = paths;
	}

	async ensureDirectories(): Promise<void> {
		await mkdir(this.paths.remindersDir, { recursive: true, mode: 0o700 });
		await mkdir(this.paths.runtimeDir, { recursive: true, mode: 0o700 });
		await mkdir(this.paths.stateDir, { recursive: true, mode: 0o700 });
	}

	private reminderPath(id: string): string {
		if (!isReminderId(id)) throw new Error("Invalid reminder id");
		return path.join(this.paths.remindersDir, `${id}.json`);
	}

	async withMutationLock<T>(operation: () => Promise<T>): Promise<T> {
		await this.ensureDirectories();
		const release = await lockfile.lock(this.paths.dataDir, {
			realpath: false,
			stale: 15_000,
			update: 5_000,
			retries: { retries: 20, factor: 1.25, minTimeout: 25, maxTimeout: 250 },
		});
		try {
			return await operation();
		} finally {
			await release();
		}
	}

	private async readUnlocked(id: string): Promise<Reminder | null> {
		try {
			const raw = JSON.parse(await readNoFollow(this.reminderPath(id)));
			return parseReminderDocument(raw).reminder;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
			throw error;
		}
	}

	async get(id: string): Promise<Reminder | null> {
		return this.readUnlocked(id);
	}

	private async scanUnlocked(): Promise<ReminderScan> {
		await this.ensureDirectories();
		const reminders: Reminder[] = [];
		const corrupt: CorruptReminder[] = [];
		let migratedCount = 0;
		const entries = await readdir(this.paths.remindersDir, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
			try {
				const raw = JSON.parse(await readNoFollow(path.join(this.paths.remindersDir, entry.name)));
				const parsed = parseReminderDocument(raw);
				reminders.push(parsed.reminder);
				if (parsed.migrated) migratedCount += 1;
			} catch (error) {
				corrupt.push({
					file: entry.name,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		return { reminders, corrupt, migratedCount };
	}

	async list(): Promise<ReminderScan> {
		return this.scanUnlocked();
	}

	async migrate(): Promise<ReminderScan> {
		return this.withMutationLock(async () => {
			const scan = await this.scanUnlocked();
			if (scan.migratedCount > 0) {
				for (const reminder of scan.reminders) {
					await atomicWriteJson(this.reminderPath(reminder.id), reminder);
				}
			}
			return scan;
		});
	}

	async create(reminder: Reminder): Promise<void> {
		await this.withMutationLock(async () => {
			if (await this.readUnlocked(reminder.id))
				throw new ReminderConflictError("Reminder already exists");
			await atomicWriteJson(this.reminderPath(reminder.id), reminder);
		});
	}

	async mutate(
		id: string,
		expectedRevision: number | undefined,
		operation: (current: Reminder) => Reminder | null | Promise<Reminder | null>,
	): Promise<Reminder | null> {
		return this.withMutationLock(async () => {
			const current = await this.readUnlocked(id);
			if (!current) throw new ReminderConflictError("Reminder no longer exists");
			if (expectedRevision !== undefined && current.revision !== expectedRevision) {
				throw new ReminderConflictError(
					"Reminder changed since it was opened; reload and try again",
				);
			}
			const result = await operation(current);
			if (result === null) {
				await rm(this.reminderPath(id), { force: true });
				return null;
			}
			if (result === current) return current;
			const updated: Reminder = {
				...result,
				id: current.id,
				schemaVersion: current.schemaVersion,
				revision: current.revision + 1,
				updatedAt: new Date().toISOString(),
			};
			parseReminderDocument(updated);
			await atomicWriteJson(this.reminderPath(id), updated);
			return updated;
		});
	}

	async delete(id: string, expectedRevision?: number): Promise<void> {
		await this.mutate(id, expectedRevision, () => null);
	}
}
