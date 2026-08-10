import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Reminder } from "../src/domain/model";
import { newReminder } from "../src/domain/model";
import { reminderPathsFromDirectories, resolveReminderPaths } from "../src/platform/paths";
import { atomicWriteFile } from "../src/storage/atomic";
import { ReminderConflictError, ReminderStore } from "../src/storage/store";

const roots: string[] = [];

async function makeStore(): Promise<ReminderStore> {
	const root = await mkdtemp(path.join(os.tmpdir(), "vicinae-storage-"));
	roots.push(root);
	return new ReminderStore(
		reminderPathsFromDirectories(path.join(root, "data"), path.join(root, "state")),
	);
}

function reminder(id = "123e4567-e89b-12d3-a456-426614174000"): Reminder {
	return {
		...newReminder(
			"  check the oven  ",
			new Date("2030-01-02T03:04:05.000Z"),
			new Date("2030-01-01T00:00:00.000Z"),
		),
		id,
	};
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("resolveReminderPaths", () => {
	it("uses absolute XDG directories and ignores relative values", () => {
		const paths = resolveReminderPaths({
			HOME: "/home/tester",
			XDG_DATA_HOME: "/tmp/data-home",
			XDG_CONFIG_HOME: "relative",
			XDG_STATE_HOME: "/tmp/state-home",
		});
		expect(paths.dataDir).toBe("/tmp/data-home/vicinae-reminders");
		expect(paths.stateDir).toBe("/tmp/state-home/vicinae-reminders");
		expect(paths.unitDir).toBe("/home/tester/.config/systemd/user");
	});
});

describe("atomic storage", () => {
	it("preserves the old target after an interrupted write and cleans its temporary file", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "vicinae-atomic-"));
		roots.push(root);
		const target = path.join(root, "state.json");
		await writeFile(target, "old\n");
		await expect(
			atomicWriteFile(target, "new\n", 0o600, {
				beforeRename: () => {
					throw new Error("interrupted");
				},
			}),
		).rejects.toThrow("interrupted");
		expect(await readFile(target, "utf8")).toBe("old\n");
		expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
	});
});

describe("ReminderStore", () => {
	it("creates, gets, mutates, and deletes reminders", async () => {
		const store = await makeStore();
		const initial = reminder();
		await store.create(initial);
		expect(await store.get(initial.id)).toMatchObject({
			id: initial.id,
			text: "check the oven",
			revision: 1,
		});
		const updated = await store.mutate(initial.id, 1, (current) => ({
			...current,
			text: "check the hob",
		}));
		expect(updated).toMatchObject({ text: "check the hob", revision: 2, id: initial.id });
		await store.delete(initial.id, 2);
		expect(await store.get(initial.id)).toBeNull();
	});

	it("enforces optimistic revision conflicts", async () => {
		const store = await makeStore();
		const initial = reminder();
		await store.create(initial);
		await expect(store.mutate(initial.id, 99, (current) => current)).rejects.toBeInstanceOf(
			ReminderConflictError,
		);
		await expect(store.create(initial)).rejects.toBeInstanceOf(ReminderConflictError);
	});

	it("isolates corrupt JSON and unsupported newer schemas during scans", async () => {
		const store = await makeStore();
		await store.ensureDirectories();
		const valid = reminder();
		await writeFile(path.join(store.paths.remindersDir, `${valid.id}.json`), JSON.stringify(valid));
		await writeFile(path.join(store.paths.remindersDir, "corrupt.json"), "{not json");
		await writeFile(
			path.join(store.paths.remindersDir, "future.json"),
			JSON.stringify({ ...valid, id: "123e4567-e89b-12d3-a456-426614174001", schemaVersion: 99 }),
		);
		await writeFile(
			path.join(store.paths.remindersDir, "impossible-date.json"),
			JSON.stringify({
				...valid,
				id: "123e4567-e89b-12d3-a456-426614174002",
				recurrence: {
					kind: "daily",
					anchorDate: "2026-02-31",
					nextDate: "2026-02-31",
					localTime: "09:00",
					weekday: 2,
					dayOfMonth: 31,
					monthEndPolicy: "clamp",
				},
			}),
		);
		const scan = await store.list();
		expect(scan.reminders).toHaveLength(1);
		expect(scan.reminders[0].id).toBe(valid.id);
		expect(scan.corrupt.map((item) => item.file).sort()).toEqual([
			"corrupt.json",
			"future.json",
			"impossible-date.json",
		]);
	});

	it("migrates schema-0 documents and reports the migration", async () => {
		const store = await makeStore();
		await store.ensureDirectories();
		const old = reminder();
		await writeFile(
			path.join(store.paths.remindersDir, `${old.id}.json`),
			JSON.stringify({
				schemaVersion: 0,
				id: old.id,
				text: "  legacy  ",
				createdAt: old.createdAt,
				dueAt: old.dueAt,
			}),
		);
		const before = await store.list();
		expect(before.migratedCount).toBe(1);
		expect(before.reminders[0]).toMatchObject({ schemaVersion: 2, revision: 1, text: "legacy" });
		await store.migrate();
		expect(
			JSON.parse(await readFile(path.join(store.paths.remindersDir, `${old.id}.json`), "utf8"))
				.schemaVersion,
		).toBe(2);
	});

	it("migrates schema-1 records without losing reminder data", async () => {
		const store = await makeStore();
		await store.ensureDirectories();
		const previous = { ...reminder(), schemaVersion: 1 };
		await writeFile(
			path.join(store.paths.remindersDir, `${previous.id}.json`),
			JSON.stringify(previous),
		);
		const scan = await store.list();
		expect(scan.migratedCount).toBe(1);
		expect(scan.reminders[0]).toMatchObject({ schemaVersion: 2, text: previous.text });
	});

	it("serializes simultaneous creates and mutations", async () => {
		const store = await makeStore();
		const reminders = Array.from({ length: 8 }, (_, index) =>
			reminder(`123e4567-e89b-12d3-a456-42661417400${index + 1}`),
		);
		await Promise.all(reminders.map((item) => store.create(item)));
		expect((await store.list()).reminders).toHaveLength(8);
		const current = reminders[0];
		const results = await Promise.allSettled(
			Array.from({ length: 5 }, () =>
				store.mutate(current.id, 1, (r) => ({ ...r, text: `${r.text}!` })),
			),
		);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		expect(results.filter((r) => r.status === "rejected")).toHaveLength(4);
		expect((await store.get(current.id))?.revision).toBe(2);
	});

	it("does not resurrect a reminder when a delayed mutation races with delete", async () => {
		const store = await makeStore();
		const initial = reminder();
		await store.create(initial);
		await store.delete(initial.id, 1);
		await expect(
			store.mutate(initial.id, 1, async (current) => ({ ...current, text: "stale" })),
		).rejects.toBeInstanceOf(ReminderConflictError);
		expect(await store.get(initial.id)).toBeNull();
	});
});
