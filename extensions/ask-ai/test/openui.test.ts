import assert from "node:assert/strict";
import { test } from "node:test";
import { parseNumber, renderAnswer, richPrompt, widgetFields } from "../src/openui.ts";

test("plain answers pass through untouched", () => {
	assert.deepEqual(renderAnswer("Just **text**."), { markdown: "Just **text**.", actions: [], widgets: [] });
});

test("a block renders as Markdown with text around it, buttons become actions", () => {
	const raw = [
		"Here are the options:",
		"```openui-lang",
		"root = Col([t, tbl, ch, pl, go, cp, f1])",
		'tbl = Table(["City", "Price"], [["Lisbon", 120], ["Porto", "90 | cheap"]])',
		't = Title("Weekend trips")',
		'ch = Chart("Nights", ["Lisbon", "Porto"], [4, 2], "nights")',
		'pl = Place("Belém Tower", "Go early")',
		'go = LinkButton("Book", "https://example.com/book")',
		'cp = CopyButton("Copy itinerary", "Day 1: Alfama")',
		'f1 = FollowUp("What about Madeira?")',
		"```",
		"Enjoy.",
	].join("\n");
	const { markdown, actions } = renderAnswer(raw);
	assert.match(markdown, /^Here are the options:\n\n### Weekend trips/);
	assert.match(markdown, /\| City \| Price \|\n\| --- \| --- \|\n\| Lisbon \| 120 \|\n\| Porto \| 90 \\\| cheap \|/);
	assert.match(markdown, /\| Lisbon \| 4 nights \| █{20} \|/);
	assert.match(markdown, /\| Porto \| 2 nights \| █{10} \|/);
	assert.match(markdown, /📍 \[Belém Tower\]\(https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Bel%C3%A9m%20Tower\) — Go early/);
	assert.match(markdown, /\*\*Ask next:\*\* _What about Madeira\?_/);
	assert.match(markdown, /Madeira\?_\n\nEnjoy\.$/);
	assert.doesNotMatch(markdown, /openui-lang|root =/);
	assert.deepEqual(
		actions.map((a) => a.kind),
		["open", "open", "copy", "ask"],
	);
	assert.deepEqual(actions[1], { kind: "open", label: "Book", url: "https://example.com/book" });
});

test("a block still streaming renders what has arrived", () => {
	const { markdown } = renderAnswer('Sure.\n```openui-lang\nroot = Col([a, b])\na = Title("Hel');
	assert.equal(markdown, "Sure.\n\n### Hel");
});

test("unsafe URLs are dropped", () => {
	const raw = '```openui-lang\nroot = Col([a, b])\na = Image("http://x/y.png", "y")\nb = LinkButton("Run", "javascript:alert(1)")\n```';
	assert.deepEqual(renderAnswer(raw), { markdown: "", actions: [], widgets: [] });
});

test("dollar signs in content survive", () => {
	const { markdown } = renderAnswer('```openui-lang\nroot = Col([a])\na = Stat("Price", "$& $1 $$")\n```');
	assert.equal(markdown, "**$& $1 $$** — Price");
});

test("the prompt teaches the components, bindings and the fence", () => {
	for (const name of ["Table(", "Chart(", "Place(", "LinkButton(", "FollowUp(", "Widget(", "$binding<number>", "@Pow(", "```openui-lang"]) {
		assert.ok(richPrompt.includes(name), name);
	}
});

const KPR = [
	"KPR estimate:",
	"```openui-lang",
	"root = Col([calc, f1])",
	"$p = 500000000",
	"$i = 8",
	"$y = 15",
	'calc = Widget("KPR calculator", [p, i, y, out, total, Text("Fixed rate only.")])',
	'p = NumberInput("Loan", $p, "Rp")',
	'i = NumberInput("Interest per year", $i, "%")',
	'y = NumberInput("Years", $y)',
	"r = $i / 100 / 12",
	"n = $y * 12",
	"pay = $p * r / (1 - @Pow(1 + r, -n))",
	'out = Result("Monthly payment", @Round(pay, 0), "Rp")',
	'total = Result("Total paid", "Rp " + @Round(pay * n, 0))',
	'f1 = FollowUp("Add a down payment")',
	"```",
].join("\n");

test("a widget renders its defaults and results, and is offered as a live form", () => {
	const { markdown, widgets, actions } = renderAnswer(KPR);
	assert.equal(widgets.length, 1);
	assert.equal(widgets[0].title, "KPR calculator");
	assert.deepEqual(widgets[0].defaults, { $p: 500000000, $i: 8, $y: 15 });
	assert.match(markdown, /### 🧮 KPR calculator/);
	assert.match(markdown, /\| Loan \| Rp 500,000,000 \|/);
	assert.match(markdown, /\| Interest per year \| 8 % \|/);
	assert.match(markdown, /\*\*Monthly payment:\*\* Rp 4,778,260/);
	assert.match(markdown, /Fixed rate only\./);
	assert.match(markdown, /open it with Ctrl\+O/);
	assert.deepEqual(actions, [{ kind: "ask", question: "Add a down payment" }]);
});

test("widget results recompute from changed inputs", () => {
	const [widget] = renderAnswer(KPR).widgets;
	const fields = widgetFields(widget, { ...widget.defaults, $p: 300000000 });
	assert.deepEqual(
		fields.map((f) => f.kind),
		["number", "number", "number", "result", "result", "note"],
	);
	assert.deepEqual(fields[0], { kind: "number", label: "Loan", name: "$p", unit: "Rp" });
	assert.deepEqual(fields[3], { kind: "result", label: "Monthly payment", value: "Rp 2,866,956" });
	assert.equal((fields[4] as { value: string }).value, "Rp 516052126");
});

test("an input given a literal instead of a $variable is still editable", () => {
	const raw = '```openui-lang\nroot = Col([w])\nw = Widget("Tip", [NumberInput("Bill", 100), Result("Tip", 0)])\n```';
	const [widget] = renderAnswer(raw).widgets;
	assert.deepEqual(widget.defaults, { $field0: 100 });
	assert.equal(widgetFields(widget, widget.defaults)[0].kind, "number");
});

test("numbers typed the Indonesian or English way", () => {
	const cases: [string, number | null][] = [
		["500000000", 500000000],
		["500.000.000", 500000000],
		["500,000,000", 500000000],
		["1.000", 1000],
		["1,000", 1000],
		["1.000,5", 1000.5],
		["1,000.5", 1000.5],
		["8,5", 8.5],
		["8.5", 8.5],
		["0.125", 0.125],
		["Rp 2.500.000", 2500000],
		["-3", -3],
		["", null],
		["abc", null],
	];
	for (const [text, want] of cases) assert.equal(parseNumber(text), want, text);
});
