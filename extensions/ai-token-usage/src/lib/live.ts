import { type FSWatcher, watch } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Where the v1 tools append usage, as tokscale reads it.
export function logLocations(env = process.env, home = homedir()): { path: string; recursive: boolean }[] {
	const data = env.XDG_DATA_HOME || join(home, ".local", "share");
	return [
		{ path: join(home, ".claude", "projects"), recursive: true },
		{ path: join(env.CODEX_HOME || join(home, ".codex"), "sessions"), recursive: true },
		{ path: join(data, "opencode"), recursive: false }, // opencode.db and its -wal
		{ path: join(data, "opencode", "storage", "message"), recursive: true }, // legacy OpenCode
	];
}

// Calls `onChange` when any tool writes a log. A location that cannot be watched (missing,
// inotify limit) is skipped: live refresh is a convenience, the 5-min background run still works.
export function watchLogs(onChange: () => void, locations = logLocations()): () => void {
	const watchers: FSWatcher[] = [];
	for (const { path, recursive } of locations) {
		try {
			const w = watch(path, { recursive, persistent: false }, onChange);
			w.on("error", () => w.close());
			watchers.push(w);
		} catch {
			// not present on this machine
		}
	}
	return () => {
		for (const w of watchers) w.close();
	};
}

// Token Monitor's watch timing (shared/collector.js): each event re-arms a 1.5 s debounce, but a
// steady stream of events never holds the refresh back more than 5 s after the first one.
export const WATCH_DEBOUNCE_MS = 1_500;
export const WATCH_MAX_WAIT_MS = 5_000;

// Coalesces log events into refreshes. An event during a running refresh schedules one more after it.
export function liveRefresher(
	refresh: () => Promise<unknown>,
	{ debounceMs = WATCH_DEBOUNCE_MS, maxWaitMs = WATCH_MAX_WAIT_MS, now = Date.now } = {},
) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let deadline: number | null = null;
	let running = false;
	let pending = false;
	let stopped = false;

	const fire = async () => {
		timer = undefined;
		deadline = null;
		running = true;
		try {
			await refresh();
		} finally {
			running = false;
		}
		if (pending && !stopped) {
			pending = false;
			markDirty();
		}
	};

	function markDirty() {
		if (stopped) return;
		if (running) {
			pending = true;
			return;
		}
		const t = now();
		deadline ??= t + maxWaitMs;
		if (timer) clearTimeout(timer);
		timer = setTimeout(fire, Math.max(0, Math.min(debounceMs, deadline - t)));
	}

	return {
		markDirty,
		stop: () => {
			stopped = true;
			if (timer) clearTimeout(timer);
		},
	};
}
