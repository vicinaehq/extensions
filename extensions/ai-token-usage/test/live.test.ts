import { expect, test } from "bun:test";
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { liveRefresher, logLocations, watchLogs } from "../src/lib/live";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("a burst of events causes one refresh after the debounce", async () => {
	let calls = 0;
	const r = liveRefresher(async () => void calls++, { debounceMs: 40, maxWaitMs: 1000 });
	for (let i = 0; i < 5; i++) r.markDirty();
	await sleep(20);
	expect(calls).toBe(0);
	await sleep(50);
	expect(calls).toBe(1);
	r.stop();
});

test("a steady stream still refreshes by the max wait", async () => {
	let calls = 0;
	const r = liveRefresher(async () => void calls++, { debounceMs: 40, maxWaitMs: 100 });
	const stream = setInterval(r.markDirty, 10);
	await sleep(160);
	clearInterval(stream);
	r.stop();
	expect(calls).toBeGreaterThanOrEqual(1);
});

test("an event during a refresh triggers exactly one more", async () => {
	let calls = 0;
	let release: () => void = () => {};
	const r = liveRefresher(() => new Promise<void>((res) => (calls++, (release = res))), { debounceMs: 10, maxWaitMs: 100 });
	r.markDirty();
	await sleep(20);
	expect(calls).toBe(1);
	r.markDirty();
	r.markDirty();
	release();
	await sleep(30);
	expect(calls).toBe(2);
	release();
	await sleep(30);
	expect(calls).toBe(2);
	r.stop();
});

test("no events, no refresh; stop cancels a pending one", async () => {
	let calls = 0;
	const r = liveRefresher(async () => void calls++, { debounceMs: 20, maxWaitMs: 100 });
	await sleep(40);
	r.markDirty();
	r.stop();
	await sleep(40);
	expect(calls).toBe(0);
});

test("log locations follow CODEX_HOME and XDG_DATA_HOME", () => {
	const locs = logLocations({ CODEX_HOME: "/c", XDG_DATA_HOME: "/d" }, "/h").map((l) => l.path);
	expect(locs).toEqual(["/h/.claude/projects", "/c/sessions", "/d/opencode", "/d/opencode/storage/message"]);
});

test("an append deep in a watched folder is noticed; missing folders are skipped", async () => {
	const root = mkdtempSync(join(tmpdir(), "live-"));
	mkdirSync(join(root, "proj"));
	writeFileSync(join(root, "proj", "s.jsonl"), "");
	let changes = 0;
	const stop = watchLogs(() => changes++, [
		{ path: root, recursive: true },
		{ path: join(root, "missing"), recursive: true },
	]);
	await new Promise((r) => setTimeout(r, 100));
	appendFileSync(join(root, "proj", "s.jsonl"), "{}\n");
	await new Promise((r) => setTimeout(r, 300));
	stop();
	expect(changes).toBeGreaterThan(0);
});
