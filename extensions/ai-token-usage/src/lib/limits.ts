import { execFile } from "node:child_process";

export type LimitWindow = {
	label: string;
	usedPercent: number;
	resetsAt?: string; // ISO time, when the source gives one
	resetText?: string; // human text, when it does not
	amount?: { used: number; total: number }; // USD, for credit balances and spend limits
};

export type LimitsReport =
	| {
			provider: string;
			available: true;
			plan?: string;
			source: string;
			windows: LimitWindow[];
			spend?: { today: number; week: number; month: number }; // USD, provider's own periods
			stale?: { reason: string; asOf: number }; // last good values kept after a failed fetch
			warning?: string; // part of the data failed to load (e.g. one of two API calls)
			retryAfter?: number;
		}
	| { provider: string; available: false; reason: string; retryAfter?: number };

// A limits source for one tool. `readsCredentials` must be true when the
// provider itself reads a secret (API key, login file); it is shown to the user.
export type LimitsProvider = {
	id: string;
	name: string;
	readsCredentials: boolean;
	fetch: () => Promise<LimitsReport | null>; // null = not configured, show nothing
};

export type Runner = (cmd: string, args: string[], timeoutMs: number) => Promise<string>;

export const run: Runner = (cmd, args, timeoutMs) =>
	new Promise((resolve, reject) => {
		const child = execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
			if (!error) return resolve(stdout);
			if ((error as NodeJS.ErrnoException).code === "ENOENT")
				return reject(new Error(`\`${cmd}\` not found on the PATH Vicinae starts with`));
			reject(new Error(stderr.trim() || error.message));
		});
		child.stdin?.end(); // `claude -p` otherwise waits 3 s for piped input
	});

const TOKSCALE_LABELS: Record<string, string> = { Session: "Session (5h)", Weekly: "Weekly" };

type TokscaleUsageEntry = { provider: string; plan?: string; windows: LimitWindow[] };

// `tokscale usage --json` output as far as it is read; every field is checked before use.
type RawMetric = { label?: unknown; used_percent?: unknown; resets_at?: unknown };
type RawUsageProvider = { provider?: unknown; plan?: unknown; metrics?: RawMetric[] };

export function parseTokscaleUsage(json: string): TokscaleUsageEntry[] {
	const data = JSON.parse(json) as RawUsageProvider[] | null;
	if (!Array.isArray(data)) throw new Error("tokscale usage output is not a list");
	return data.map((p) => ({
		provider: String(p?.provider ?? ""),
		plan: typeof p?.plan === "string" && p.plan ? p.plan : undefined,
		windows: (Array.isArray(p?.metrics) ? p.metrics : []).flatMap((m): LimitWindow[] => {
			if (typeof m?.used_percent !== "number") return [];
			const label = String(m.label);
			return [
				{
					label: TOKSCALE_LABELS[label] ?? label,
					usedPercent: m.used_percent,
					resetsAt: typeof m.resets_at === "string" ? m.resets_at : undefined,
				},
			];
		}),
	}));
}

// Parses the limit lines of `claude -p /usage`, e.g.
// "Current week (all models): 21% used · resets Nov 15, 8:59pm (Europe/Berlin)".
// shortcut: keeps the reset as text instead of a time; parse it if the countdown matters for this route.
export function parseClaudeUsageText(text: string): LimitWindow[] {
	const windows: LimitWindow[] = [];
	for (const line of text.split("\n")) {
		const m = line.match(/^\s*Current (session|week \(([^)]+)\)):\s*(\d+(?:\.\d+)?)% used(?:\s*·\s*resets\s+(.+?))?\s*$/i);
		if (!m) continue;
		const scope = m[2];
		const label = m[1].toLowerCase() === "session" ? "Session (5h)" : scope === "all models" ? "Weekly" : scope;
		windows.push({ label, usedPercent: Number(m[3]), resetText: m[4]?.replace(/\s*\([^)]*\)$/, "") });
	}
	return windows;
}

// tokscale's JSON drops a rate-limited provider silently; its text output says
// "Claude: rate-limited; retry in 1823s — skipped" from local state, without a network call.
export function parseRateLimit(text: string, provider = "Claude"): number | null {
	const m = text.match(new RegExp(`^\\s*${provider}: rate-limited; retry in (\\d+)s`, "mi"));
	return m ? Number(m[1]) : null;
}

// Route 1: tokscale usage (read-only on Claude's login). Route 2: `claude -p /usage`,
// which also makes Claude Code refresh its own token. The extension never touches
// ~/.claude/.credentials.json itself.
export async function fetchClaudeLimits(runner: Runner = run): Promise<LimitsReport> {
	// tokscale reports nothing once Claude's saved login token expires; it never refreshes it itself
	let reason = "Claude Code limits not reported by tokscale";
	try {
		const claude = parseTokscaleUsage(await runner("tokscale", ["usage", "--json"], 60_000)).find(
			(p) => p.provider.toLowerCase() === "claude",
		);
		if (claude && claude.windows.length > 0) {
			return { provider: "Claude Code", available: true, plan: claude.plan, source: "tokscale", windows: claude.windows };
		}
	} catch (e) {
		reason = e instanceof Error ? e.message : String(e);
	}
	// claude /usage asks the same endpoint, so it cannot help while Anthropic rate-limits it
	const retryIn = await runner("tokscale", ["usage", "--light"], 60_000)
		.then((text) => parseRateLimit(text))
		.catch(() => null);
	if (retryIn !== null) {
		return {
			provider: "Claude Code",
			available: false,
			reason: `Anthropic is rate-limiting the usage endpoint; retry in ${Math.ceil(retryIn / 60)} min`,
			retryAfter: Date.now() + retryIn * 1000,
		};
	}
	try {
		const windows = parseClaudeUsageText(await runner("claude", ["-p", "/usage"], 60_000));
		if (windows.length > 0) return { provider: "Claude Code", available: true, source: "claude /usage", windows };
		reason = "claude /usage printed no limits";
	} catch (e) {
		reason = `${reason}; fallback \`claude -p /usage\` failed: ${e instanceof Error ? e.message : String(e)}`;
	}
	return { provider: "Claude Code", available: false, reason };
}

export type LimitsSnapshot = { fetchedAt: number; reports: LimitsReport[] };

export const LIMITS_TTL_MS = 5 * 60_000;
export const FAILURE_BACKOFF_MS = 15 * 60_000;

// Usage endpoints rate-limit hard (Anthropic answered "retry in 51 min" after a few calls a
// minute), so a failed provider keeps its last good values and is not asked again for 15 minutes.
// `previousAt` is when `previous` was fetched; a kept report remembers when it was last good.
export function mergeReport(fresh: LimitsReport, previous: LimitsReport | undefined, previousAt: number, now: number): LimitsReport {
	if (fresh.available) return fresh;
	const retryAfter = Math.max(now + FAILURE_BACKOFF_MS, fresh.retryAfter ?? 0);
	if (previous?.available) {
		return { ...previous, stale: { reason: fresh.reason, asOf: previous.stale?.asOf ?? previousAt }, retryAfter };
	}
	return { ...fresh, retryAfter };
}

export async function fetchLimits(providers: LimitsProvider[], previous?: LimitsSnapshot | null, now = Date.now()): Promise<LimitsSnapshot> {
	const results = await Promise.all(
		providers.map(async (p): Promise<LimitsReport | null> => {
			const prev = previous?.reports.find((r) => r.provider === p.name);
			if (prev?.retryAfter && prev.retryAfter > now) return prev; // backing off
			const fresh = await p.fetch().catch(
				(e): LimitsReport => ({ provider: p.name, available: false, reason: e instanceof Error ? e.message : String(e) }),
			);
			return fresh && mergeReport(fresh, prev, previous?.fetchedAt ?? now, now);
		}),
	);
	return { fetchedAt: now, reports: results.filter((r): r is LimitsReport => r !== null) };
}

// Like Token Monitor: refresh 30 s after a window resets, so its % drops without waiting for the next poll.
export const RESET_DELAY_MS = 30_000;

// Earliest reset (+30 s) that falls after the snapshot was fetched; null when none is known.
export function nextResetBoundary(snapshot: LimitsSnapshot | null): number | null {
	if (!snapshot) return null;
	let next: number | null = null;
	for (const r of snapshot.reports) {
		if (!r.available) continue;
		for (const w of r.windows) {
			const at = w.resetsAt ? Date.parse(w.resetsAt) + RESET_DELAY_MS : Number.NaN;
			if (Number.isFinite(at) && at > snapshot.fetchedAt && (next === null || at < next)) next = at;
		}
	}
	return next;
}

export function isFresh(snapshot: LimitsSnapshot | null, now = Date.now()): boolean {
	if (!snapshot || now - snapshot.fetchedAt >= LIMITS_TTL_MS) return false;
	const boundary = nextResetBoundary(snapshot);
	return boundary === null || boundary > now;
}

export function formatReset(w: LimitWindow, now = Date.now()): string | undefined {
	if (!w.resetsAt) return w.resetText ? `resets ${w.resetText}` : undefined;
	const ms = Date.parse(w.resetsAt) - now;
	if (!Number.isFinite(ms)) return undefined;
	if (ms <= 0) return "resetting";
	const min = Math.round(ms / 60_000);
	const d = Math.floor(min / 1440);
	const h = Math.floor((min % 1440) / 60);
	const m = min % 60;
	return `resets in ${d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`}`;
}
