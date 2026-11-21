import {
	type ElementNode,
	createLibrary,
	createParser,
	defineComponent,
	defineFunction,
	evaluate,
	markReactive,
} from "@openuidev/lang-core";
import { z } from "zod";

/**
 * Rich answers in the spirit of ChatGPT's Intelligent UI, using OpenUI Lang (thesysdev/openui, MIT).
 * The model may add one ```openui-lang block. Display components render as Markdown, buttons become
 * actions, and a Widget (inputs bound to $variables plus computed Results) opens as a live form.
 */

const component = <T extends z.ZodRawShape>(name: string, description: string, props: T) =>
	defineComponent({ name, description, props: z.object(props), component: null });

/** A prop the user edits; prints as $binding<type> in the prompt. */
function binding<T extends z.ZodType>(schema: T): T {
	markReactive(schema);
	return schema;
}

const Title = component("Title", "Section heading", { text: z.string() });
const Text = component("Text", "Paragraph; Markdown allowed", { text: z.string() });
const List = component("List", "Bullet list, or numbered steps when ordered is true", {
	items: z.array(z.string()),
	ordered: z.boolean().optional(),
});
const Table = component("Table", "Table for comparisons and structured data", {
	columns: z.array(z.string()),
	rows: z.array(z.array(z.union([z.string(), z.number()]))),
});
const Chart = component("Chart", "Bar chart of numeric values, one bar per label", {
	title: z.string(),
	labels: z.array(z.string()),
	values: z.array(z.number()),
	unit: z.string().optional(),
});
const Stat = component("Stat", "One key figure with its label", { label: z.string(), value: z.string() });
const Callout = component("Callout", "Highlighted note", {
	text: z.string(),
	tone: z.enum(["info", "tip", "warning"]).optional(),
});
const Code = component("Code", "Code or a shell command", { code: z.string(), language: z.string().optional() });
const Image = component("Image", "Image from a public https URL you are sure exists", {
	url: z.string(),
	alt: z.string(),
});
const Place = component("Place", "A real place; rendered as a map link", { name: z.string(), note: z.string().optional() });
const LinkButton = component("LinkButton", "Button that opens a URL", { label: z.string(), url: z.string() });
const CopyButton = component("CopyButton", "Button that copies text to the clipboard", { label: z.string(), text: z.string() });
const FollowUp = component("FollowUp", "Suggested follow-up question the user can ask with one key", {
	question: z.string(),
});

const NumberInput = component("NumberInput", "Number the user can change", {
	label: z.string(),
	value: binding(z.number()),
	unit: z.string().optional(),
});
const TextInput = component("TextInput", "Text the user can change", { label: z.string(), value: binding(z.string()) });
const Select = component("Select", "Choice from fixed options", {
	label: z.string(),
	options: z.array(z.string()),
	value: binding(z.string()),
});
const Toggle = component("Toggle", "On/off switch", { label: z.string(), value: binding(z.boolean()) });
const Result = component("Result", "Value computed live from the inputs", {
	label: z.string(),
	value: z.union([z.string(), z.number()]),
	unit: z.string().optional(),
});
const Widget = component(
	"Widget",
	"Interactive tool (calculator, converter, estimator): inputs bound to $variables and Results computed from them",
	{
		title: z.string(),
		children: z.array(z.union([NumberInput.ref, TextInput.ref, Select.ref, Toggle.ref, Result.ref, Text.ref, Callout.ref])),
	},
);

const Pow = defineFunction({
	name: "Pow",
	description: "base raised to exp (use for compound interest, growth, decay)",
	params: z.object({ base: z.number(), exp: z.number() }),
	returns: z.number(),
	fn: ({ base, exp }) => base ** exp,
});

const children = z.array(
	z.union([
		Title.ref,
		Text.ref,
		List.ref,
		Table.ref,
		Chart.ref,
		Stat.ref,
		Callout.ref,
		Code.ref,
		Image.ref,
		Place.ref,
		LinkButton.ref,
		CopyButton.ref,
		FollowUp.ref,
		Widget.ref,
	]),
);
const Col = component("Col", "Root: the answer's sections, top to bottom", { children });

const library = createLibrary({
	root: "Col",
	components: [
		Col,
		Title,
		Text,
		List,
		Table,
		Chart,
		Stat,
		Callout,
		Code,
		Image,
		Place,
		LinkButton,
		CopyButton,
		FollowUp,
		Widget,
		NumberInput,
		TextInput,
		Select,
		Toggle,
		Result,
	],
	functions: [Pow],
});
const schema = library.toJSONSchema();
const parser = createParser(schema);
const functions = Object.fromEntries(
	Object.entries(schema.functions ?? {}).map(([name, spec]) => [name, { ...spec, fn: library.functions[name].fn }]),
);

export const richPrompt = library.prompt({
	bindings: true,
	preamble:
		"You may add structured UI to an answer with openui-lang. Answer in Markdown as usual. " +
		"When structure genuinely helps (comparisons, numbers, steps, places, links, commands, calculations), also add exactly one fenced " +
		"```openui-lang block. Text outside the block is shown as is. Skip the block for short or conversational answers.",
	additionalRules: [
		"Never repeat in the block what the text already says; the text can be one short sentence when the block carries the answer.",
		"Offer 1-3 FollowUp questions when a natural next question exists.",
		"Use Chart only for real numbers you are confident about.",
		"When the user wants to calculate, convert, estimate or compare scenarios, build a Widget instead of writing code: declare $variables with sensible defaults, bind them to inputs, and compute Results from them. Use @Round for display and @Pow for powers. Pass Results a number plus a unit (not a pre-joined string) so they are formatted with thousands separators. Buttons, @Set and @Reset are not available.",
	],
});

export type RichAction =
	| { kind: "open"; label: string; url: string }
	| { kind: "copy"; label: string; text: string }
	| { kind: "ask"; question: string };

export type State = Record<string, unknown>;

/** One interactive tool from an answer, opened as a live form. */
export type WidgetSpec = { title: string; node: ElementNode; defaults: State };

export type Field =
	| { kind: "number" | "text"; label: string; name: string; unit?: string }
	| { kind: "select"; label: string; name: string; options: string[] }
	| { kind: "toggle"; label: string; name: string }
	| { kind: "result"; label: string; value: string }
	| { kind: "note"; text: string };

export type Rendered = { markdown: string; actions: RichAction[]; widgets: WidgetSpec[] };

const FENCE = /```openui-lang[^\n]*\n([\s\S]*?)(?:```|$)/;

const mapsUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const cell = (v: unknown) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

const CURRENCY_PREFIX = /^(Rp|IDR|\$|US\$|S\$|A\$|€|£|¥|₹|RM|SGD|USD|EUR)$/;

/** Numbers get thousands separators; currency units go in front ("Rp 4,778,260"), others after ("15 years"). */
export function formatValue(v: unknown, unit?: string): string {
	const text = typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: 6 }) : str(v);
	if (!unit || !text) return text;
	return CURRENCY_PREFIX.test(unit) ? `${unit} ${text}` : `${text} ${unit}`;
}

/**
 * Reads numbers typed either way: "500,000,000", "500.000.000", "1.000,5", "1,000.5", "8,5", "8.5".
 * A lone separator before exactly three digits ("1.000", "1,000") is a thousands separator.
 */
export function parseNumber(text: string): number | null {
	let s = text.replace(/[\s_]/g, "").replace(/[^\d.,-]/g, "");
	const dots = (s.match(/\./g) ?? []).length;
	const commas = (s.match(/,/g) ?? []).length;
	if (dots + commas === 1 && /^-?[1-9]\d{0,2}[.,]\d{3}$/.test(s)) s = s.replace(/[.,]/, "");
	else if (dots > 1 || (dots === 1 && commas >= 1 && s.indexOf(".") < s.indexOf(","))) s = s.replace(/\./g, "").replace(",", ".");
	else if (commas > 1 || (commas === 1 && dots === 1)) s = s.replace(/,/g, "");
	else if (commas === 1) s = s.replace(",", ".");
	if (s === "" || s === "-") return null;
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
}

const isAst =(v: unknown): v is { k: string } => !!v && typeof v === "object" && "k" in v && !("type" in v);

/** Evaluates a prop that may be an expression over $variables. */
function resolve(v: unknown, state: State): unknown {
	if (!isAst(v)) return v;
	return evaluate(v as never, { getState: (name) => state[name], resolveRef: () => null, functions });
}

/** The $variable an input is bound to; a literal value gets a private one so it is still editable. */
const boundName = (v: unknown, fallback: string) =>
	isAst(v) && v.k === "StateRef" ? (v as unknown as { n: string }).n : fallback;

function table(columns: unknown[], rows: unknown[][]): string {
	if (!columns.length) return "";
	const head = `| ${columns.map(cell).join(" | ")} |\n|${columns.map(() => " --- |").join("")}`;
	return [head, ...rows.map((r) => `| ${columns.map((_, i) => cell(r?.[i])).join(" | ")} |`)].join("\n");
}

const kids = (node: ElementNode) =>
	(((node.props as Record<string, unknown>).children ?? []) as (ElementNode | null)[]).filter((c): c is ElementNode => !!c);

/** A widget's fields, with Results evaluated against the current state. */
export function widgetFields(widget: WidgetSpec, state: State): Field[] {
	return kids(widget.node).flatMap((child, i): Field[] => {
		const p = child.props as Record<string, unknown>;
		const label = str(resolve(p.label, state));
		const name = boundName(p.value, `$field${i}`);
		switch (child.typeName) {
			case "NumberInput":
				return [{ kind: "number", label, name, unit: str(p.unit) || undefined }];
			case "TextInput":
				return [{ kind: "text", label, name }];
			case "Select":
				return [{ kind: "select", label, name, options: ((resolve(p.options, state) ?? []) as unknown[]).map(str) }];
			case "Toggle":
				return [{ kind: "toggle", label, name }];
			case "Result":
				return [{ kind: "result", label, value: formatValue(resolve(p.value, state), str(p.unit) || undefined) }];
			case "Text":
			case "Callout":
				return [{ kind: "note", text: str(resolve(p.text, state)) }];
			default:
				return [];
		}
	});
}

const INPUTS = new Set(["NumberInput", "TextInput", "Select", "Toggle"]);

/** Defaults for every input: declared $variable values, or the literal the model wrote. */
function widgetDefaults(node: ElementNode, declared: State): State {
	const state: State = { ...declared };
	kids(node).forEach((child, i) => {
		if (!INPUTS.has(child.typeName)) return;
		const value = (child.props as Record<string, unknown>).value;
		const name = boundName(value, `$field${i}`);
		if (!(name in state)) state[name] = isAst(value) ? null : value;
	});
	return state;
}

function renderNode(node: ElementNode, out: Rendered, declared: State): string {
	const p = node.props as Record<string, unknown>;
	const v = (key: string) => resolve(p[key], declared);
	switch (node.typeName) {
		case "Col":
			return kids(node)
				.map((c) => renderNode(c, out, declared))
				.filter(Boolean)
				.join("\n\n");
		case "Title":
			return v("text") ? `### ${str(v("text"))}` : "";
		case "Text":
			return str(v("text"));
		case "List":
			return ((v("items") ?? []) as unknown[]).map((item, i) => `${v("ordered") ? `${i + 1}.` : "-"} ${str(item)}`).join("\n");
		case "Table":
			return table((v("columns") ?? []) as unknown[], (v("rows") ?? []) as unknown[][]);
		case "Chart": {
			const values = ((v("values") ?? []) as unknown[]).map(Number);
			const max = Math.max(...values.filter(Number.isFinite), 0);
			const unit = str(v("unit"));
			const rows = ((v("labels") ?? []) as unknown[]).map((label, i) => {
				const n = values[i];
				const bar = Number.isFinite(n) && max > 0 ? "█".repeat(Math.max(1, Math.round((n / max) * 20))) : "";
				return [label, `${n ?? ""}${unit ? ` ${unit}` : ""}`, bar];
			});
			return `**${str(v("title"))}**\n\n${table(["", "Value", ""], rows)}`;
		}
		case "Stat":
			return `**${str(v("value"))}** — ${str(v("label"))}`;
		case "Callout": {
			const icon = v("tone") === "warning" ? "⚠️" : v("tone") === "tip" ? "💡" : "ℹ️";
			return `> ${icon} ${str(v("text")).replace(/\n/g, "\n> ")}`;
		}
		case "Code":
			return v("code") ? `\`\`\`${str(v("language"))}\n${str(v("code"))}\n\`\`\`` : "";
		case "Image": {
			const url = str(v("url"));
			return /^https:\/\//.test(url) ? `![${str(v("alt"))}](${url})` : "";
		}
		case "Place": {
			const name = str(v("name"));
			if (!name) return "";
			out.actions.push({ kind: "open", label: `Open ${name} in Maps`, url: mapsUrl(name) });
			const note = str(v("note"));
			return `📍 [${name}](${mapsUrl(name)})${note ? ` — ${note}` : ""}`;
		}
		case "LinkButton": {
			const url = str(v("url"));
			if (!/^https?:\/\//.test(url)) return "";
			const label = str(v("label")) || url;
			out.actions.push({ kind: "open", label, url });
			return `[${label}](${url})`;
		}
		case "CopyButton":
			if (v("text")) out.actions.push({ kind: "copy", label: str(v("label")) || "Copy", text: str(v("text")) });
			return "";
		case "FollowUp":
			if (v("question")) out.actions.push({ kind: "ask", question: str(v("question")) });
			return "";
		case "Widget": {
			const widget: WidgetSpec = { title: str(v("title")) || "Calculator", node, defaults: widgetDefaults(node, declared) };
			out.widgets.push(widget);
			const fields = widgetFields(widget, widget.defaults);
			const inputs = fields.flatMap((f) =>
				f.kind === "number" || f.kind === "text" || f.kind === "select" || f.kind === "toggle"
					? [[f.label, formatValue(widget.defaults[f.name], "unit" in f ? f.unit : undefined)]]
					: [],
			);
			const results = fields.flatMap((f) => (f.kind === "result" ? [`**${f.label}:** ${f.value}`] : []));
			const notes = fields.flatMap((f) => (f.kind === "note" && f.text ? [f.text] : []));
			const hint = out.widgets.length === 1 ? "Ctrl+O" : "the action menu";
			return [
				`### 🧮 ${widget.title}`,
				inputs.length ? table(["Input", "Value"], inputs) : "",
				results.join("  \n"),
				...notes,
				`_Interactive: open it with ${hint} to change the numbers._`,
			]
				.filter(Boolean)
				.join("\n\n");
		}
		default:
			return "";
	}
}

/** Renders an answer: text outside the openui-lang block as is, the block as Markdown plus actions and widgets. */
export function renderAnswer(raw: string): Rendered {
	const match = raw.match(FENCE);
	const out: Rendered = { markdown: raw, actions: [], widgets: [] };
	if (!match) return out;
	let block = "";
	try {
		const result = parser.parse(match[1]);
		block = result.root ? renderNode(result.root, out, result.stateDeclarations ?? {}) : "";
	} catch {
		// A malformed block falls back to showing its source.
		block = `\`\`\`\n${match[1]}\n\`\`\``;
	}
	const followUps = out.actions.filter((a) => a.kind === "ask");
	const suggestions = followUps.length ? `\n\n**Ask next:** ${followUps.map((a) => `_${a.question}_`).join(" · ")}` : "";
	out.markdown = raw
		.replace(match[0], () => `\n\n${block}${suggestions}\n\n`)
		.replace(/\n{3,}/g, "\n\n")
		.trim();
	return out;
}
