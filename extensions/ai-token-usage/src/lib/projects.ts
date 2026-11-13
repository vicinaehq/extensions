import { CLIENTS, type ModelTotal } from "./usage";
import { run } from "./limits";
import { claudeMeta, codexMeta, opencodeMeta, projectKey, safe, type SessionMeta } from "./sessions";

export type SessionRow = {
	client: string;
	sessionId: string;
	title?: string;
	tokens: number;
	cost: number;
	models: ModelTotal[];
};
export type Project = { key: string; label: string; tokens: number; cost: number; sessions: SessionRow[] };
export type ProjectsSnapshot = { fetchedAt: number; projects: Project[] };

// `tokscale --json --group-by ...` entries as far as they are read; every field is checked before use.
type Entry = {
	client?: unknown;
	sessionId?: unknown;
	model?: unknown;
	input?: unknown;
	output?: unknown;
	cacheRead?: unknown;
	cacheWrite?: unknown;
	reasoning?: unknown;
	cost?: unknown;
	workspaceKey?: unknown;
	workspaceLabel?: unknown;
};
const UNKNOWN = "unknown";
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const tokens = (e: Entry) => num(e.input) + num(e.output) + num(e.cacheRead) + num(e.cacheWrite) + num(e.reasoning);

export function entries(json: string): Entry[] {
	const data = JSON.parse(json) as { entries?: Entry[] } | null;
	if (!Array.isArray(data?.entries)) throw new Error("tokscale output has no entries");
	return data.entries;
}

// Project names from `--group-by workspace,model`, keyed like sessions: "calit (/home/x/calit)" -> "calit".
export function projectLabels(workspaceEntries: Entry[]): Map<string, string> {
	const labels = new Map<string, string>();
	for (const e of workspaceEntries) {
		if (typeof e.workspaceKey !== "string") continue;
		labels.set(projectKey(e.workspaceKey), String(e.workspaceLabel ?? e.workspaceKey).replace(/\s+\(.*\)$/, ""));
	}
	return labels;
}

export const metaKey = (client: string, sessionId: string) => `${client}:${sessionId}`;

export function buildProjects(sessionEntries: Entry[], labels: Map<string, string>, meta: Map<string, SessionMeta>): Project[] {
	const sessions = new Map<string, SessionRow & { projectKey: string; projectLabel?: string }>();
	for (const e of sessionEntries) {
		const key = metaKey(String(e.client), String(e.sessionId));
		const m = meta.get(key);
		const s = sessions.get(key) ?? {
			client: String(e.client),
			sessionId: String(e.sessionId),
			title: m?.title,
			projectKey: m?.projectKey ?? UNKNOWN,
			projectLabel: m?.projectLabel,
			tokens: 0,
			cost: 0,
			models: [],
		};
		const t = tokens(e);
		s.tokens += t;
		s.cost += num(e.cost);
		const model = s.models.find((x) => x.model === e.model);
		if (model) {
			model.tokens += t;
			model.cost += num(e.cost);
		} else s.models.push({ model: String(e.model), tokens: t, cost: num(e.cost) });
		sessions.set(key, s);
	}
	const projects = new Map<string, Project>();
	for (const { projectKey: key, projectLabel, ...s } of sessions.values()) {
		s.models.sort((a, b) => b.cost - a.cost);
		const p = projects.get(key) ?? {
			key,
			label: labels.get(key) ?? projectLabel ?? (key === UNKNOWN ? "Unknown project" : key),
			tokens: 0,
			cost: 0,
			sessions: [],
		};
		p.tokens += s.tokens;
		p.cost += s.cost;
		p.sessions.push(s);
		projects.set(key, p);
	}
	const list = [...projects.values()];
	for (const p of list) p.sessions.sort((a, b) => b.cost - a.cost);
	return list.sort((a, b) => b.cost - a.cost);
}

export async function fetchProjects(now = Date.now()): Promise<ProjectsSnapshot> {
	const args = (group: string) => ["--json", "--month", "-c", CLIENTS, "--group-by", group, "--no-spinner"];
	const [sessionJson, workspaceJson] = await Promise.all([
		run("tokscale", args("client,session,model"), 120_000),
		run("tokscale", args("workspace,model"), 120_000),
	]);
	const sessionEntries = entries(sessionJson);
	const ids = (client: string) => new Set(sessionEntries.filter((e) => e.client === client).map((e) => String(e.sessionId)));
	const meta = new Map<string, SessionMeta>();
	for (const [client, read] of [
		["claude", claudeMeta],
		["codex", codexMeta],
		["opencode", opencodeMeta],
	] as const) {
		for (const [id, m] of safe(() => read(ids(client)))) meta.set(metaKey(client, id), m);
	}
	return { fetchedAt: now, projects: buildProjects(sessionEntries, projectLabels(entries(workspaceJson)), meta) };
}
