// Live check against real providers (uses your logins and keys, and a little quota):
//   node --experimental-strip-types test/live.ts [claude-code|codex|antigravity|anthropic|gemini ...]
// Keys come from the environment: ASK_AI_CLAUDE_KEY and ASK_AI_OPENAI_KEY (each + _BASE_URL, _MODEL), and GEMINI_API_KEY.
// Not ANTHROPIC_*: the claude CLI reads those too and would follow them.
// Runs with Vicinae's service PATH, which lacks ~/.local/bin, to prove the CLI lookup.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderAnswer, richPrompt, widgetFields } from "../src/openui.ts";
import { anthropic } from "../src/providers/anthropic.ts";
import { antigravity } from "../src/providers/antigravity.ts";
import { claudeCode } from "../src/providers/claude-code.ts";
import { codex } from "../src/providers/codex.ts";
import { gemini } from "../src/providers/gemini.ts";
import { openai } from "../src/providers/openai.ts";
import type { Message, Provider, StreamOptions } from "../src/providers/types.ts";

process.env.PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const env = process.env;
const all: [Provider, Partial<StreamOptions>][] = [
	[claudeCode, {}],
	[codex, {}],
	[antigravity, {}],
	[anthropic, { apiKey: env.ASK_AI_CLAUDE_KEY, baseUrl: env.ASK_AI_CLAUDE_BASE_URL, model: env.ASK_AI_CLAUDE_MODEL }],
	[openai, { apiKey: env.ASK_AI_OPENAI_KEY, baseUrl: env.ASK_AI_OPENAI_BASE_URL, model: env.ASK_AI_OPENAI_MODEL }],
	[gemini, { apiKey: env.GEMINI_API_KEY }],
];
const wanted = process.argv.slice(2);
const workdir = mkdtempSync(join(tmpdir(), "ask-ai-live-"));

async function run(provider: Provider, extra: Partial<StreamOptions>, messages: Message[], systemPrompt: string) {
	const started = Date.now();
	let firstDelta = 0;
	let answer = "";
	await provider.stream(messages, {
		...extra,
		systemPrompt,
		workdir,
		signal: AbortSignal.timeout(180_000),
		onDelta: (t) => {
			firstDelta ||= Date.now() - started;
			answer += t;
		},
	});
	return { answer, firstDelta, total: Date.now() - started };
}

for (const [provider, extra] of all.filter(([p]) => !wanted.length || wanted.includes(p.id))) {
	try {
		const memory = await run(
			provider,
			extra,
			[
				{ role: "user", content: "My favourite number is 41." },
				{ role: "assistant", content: "Noted." },
				{ role: "user", content: "-- What is my favourite number plus one? Reply with the number only." },
			],
			"Be direct and brief.",
		);
		console.log(`${provider.id}: memory ok first-delta=${memory.firstDelta}ms total=${memory.total}ms answer=${JSON.stringify(memory.answer.trim())}`);

		const rich = await run(
			provider,
			extra,
			[{ role: "user", content: "Compare Lisbon and Porto for a 3-day trip: cost, weather in May, top sight." }],
			`Be direct and brief.\n\n${richPrompt}`,
		);
		const { markdown, actions } = renderAnswer(rich.answer);
		console.log(
			`${provider.id}: rich block=${rich.answer.includes("```openui-lang")} table=${markdown.includes("| --- |")} ` +
				`actions=${actions.map((a) => a.kind).join(",") || "none"} leftover-code=${/root =/.test(markdown)} total=${rich.total}ms`,
		);

		const calc = await run(
			provider,
			extra,
			[{ role: "user", content: "Can we create a sample simple KPR calculator" }],
			`Be direct and brief.\n\n${richPrompt}`,
		);
		const [widget] = renderAnswer(calc.answer).widgets;
		if (!widget) {
			console.log(`${provider.id}: widget MISSING; answer starts ${JSON.stringify(calc.answer.slice(0, 200))}`);
			continue;
		}
		const fields = widgetFields(widget, widget.defaults);
		const inputs = fields.filter((f) => f.kind === "number");
		const changed = inputs[0] ? { ...widget.defaults, [inputs[0].name]: Number(widget.defaults[inputs[0].name]) * 2 } : widget.defaults;
		const results = (state: typeof widget.defaults) =>
			widgetFields(widget, state)
				.flatMap((f) => (f.kind === "result" ? [`${f.label}=${f.value}`] : []))
				.join("; ");
		console.log(
			`${provider.id}: widget "${widget.title}" inputs=${inputs.map((f) => f.label).join("|")} ` +
				`results[${results(widget.defaults)}] after-doubling-first-input[${results(changed)}] total=${calc.total}ms`,
		);
	} catch (err) {
		console.log(`${provider.id}: FAIL ${err instanceof Error ? err.message : err}`);
	}
}
