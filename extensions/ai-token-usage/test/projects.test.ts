import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProjects, metaKey, projectLabels } from "../src/lib/projects";
import { claudeMeta, claudeTitleFromText, cleanTitle, codexThreadId, projectKey } from "../src/lib/sessions";

test("Claude, Codex and OpenCode keys for one directory are the same project", () => {
	expect(projectKey("/home/finkel/work_self/ax3")).toBe("-home-finkel-work-self-ax3");
	expect(projectKey("-home-finkel-work-self-ax3")).toBe("-home-finkel-work-self-ax3");
});

test("custom title beats generated, latest wins, torn lines ignored", () => {
	const text = [
		'ype":"ai-title","aiTitle":"torn"}',
		'{"type":"ai-title","aiTitle":"First"}',
		'{"type":"custom-title","customTitle":"Renamed"}',
		'{"type":"ai-title","aiTitle":"Later"}',
	].join("\n");
	expect(claudeTitleFromText(text)).toBe("Renamed");
	expect(claudeTitleFromText('{"type":"ai-title","aiTitle":"A"}\n{"type":"ai-title","aiTitle":"B"}')).toBe("B");
	expect(claudeTitleFromText('{"type":"user"}')).toBeUndefined();
});

test("cleanTitle collapses whitespace and cuts at 96 code points", () => {
	expect(cleanTitle("  a \n b ")).toBe("a b");
	expect(Array.from(cleanTitle("é".repeat(200)) ?? "")).toHaveLength(96);
	expect(cleanTitle("")).toBeUndefined();
});

test("codexThreadId takes the uuid off a rollout name", () => {
	expect(codexThreadId("rollout-2026-11-06T12-30-55-01a1b0a0-4268-76d0-a069-17da51f6b85e")).toBe(
		"01a1b0a0-4268-76d0-a069-17da51f6b85e",
	);
});

test("claudeMeta finds the session's project folder and title", () => {
	const root = mkdtempSync(join(tmpdir(), "claude-projects-"));
	mkdirSync(join(root, "-home-u-app"));
	writeFileSync(join(root, "-home-u-app", "s1.jsonl"), '{"type":"user"}\n{"type":"ai-title","aiTitle":"Fix login"}\n');
	writeFileSync(join(root, "-home-u-app", "other.jsonl"), "");
	const meta = claudeMeta(new Set(["s1", "missing"]), root);
	expect(meta.get("s1")).toEqual({ projectKey: "-home-u-app", title: "Fix login" });
	expect(meta.has("missing")).toBe(false);
});

test("buildProjects groups sessions across tools, sums models, labels projects", () => {
	const e = (client: string, sessionId: string, model: string, cost: number) => ({
		client,
		sessionId,
		model,
		input: 1,
		output: 9,
		cacheRead: 0,
		cacheWrite: 0,
		reasoning: 0,
		cost,
	});
	const projects = buildProjects(
		[e("claude", "c1", "opus", 5), e("claude", "c1", "sonnet", 1), e("codex", "x1", "gpt", 2), e("opencode", "o1", "fable", 1)],
		projectLabels([{ workspaceKey: "/home/u/app", workspaceLabel: "app (/home/u/app)" }]),
		new Map([
			[metaKey("claude", "c1"), { projectKey: "-home-u-app", title: "Fix login" }],
			[metaKey("codex", "x1"), { projectKey: "-home-u-app", projectLabel: "app" }],
		]),
	);
	expect(projects.map((p) => [p.label, p.cost, p.sessions.length])).toEqual([
		["app", 8, 2],
		["Unknown project", 1, 1],
	]);
	const c1 = projects[0].sessions[0];
	expect(c1).toMatchObject({ client: "claude", title: "Fix login", cost: 6, tokens: 20 });
	expect(c1.models.map((m) => m.model)).toEqual(["opus", "sonnet"]);
});
