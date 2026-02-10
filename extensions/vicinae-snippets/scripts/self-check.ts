import { extractArguments, renderTemplate } from "../src/lib/placeholder-engine";
import { importFromJsonTextToStore } from "../src/lib/import-export";
import type { Snippet } from "../src/lib/snippet-model";
import { nowIso } from "../src/lib/snippet-model";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertMatch(value: string, re: RegExp, message: string) {
  assert(re.test(value), `${message}\n  value: ${JSON.stringify(value)}\n  expected: ${re}`);
}

async function test(name: string, fn: () => void | Promise<void>, failures: string[]) {
  try {
    await fn();
    process.stdout.write(`✓ ${name}\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`✗ ${name}\n${msg}\n\n`);
    failures.push(`${name}: ${msg}`);
  }
}

async function main() {
  const failures: string[] = [];

  await test(
    "extractArguments: too many distinct arguments",
    () => {
      const { specs, notices } = extractArguments("{argument} {argument} {argument} {argument}");
      assert(notices.some((n) => n.kind === "too_many_arguments"), "Expected too_many_arguments notice");
      assert(specs.length === 3, `Expected 3 specs, got ${specs.length}`);
      assert(
        specs.map((s) => s.key).join(",") === "arg1,arg2,arg3",
        `Expected arg1..arg3 keys, got ${specs.map((s) => s.key).join(",")}`,
      );
    },
    failures,
  );

  await test(
    "renderTemplate: too many arguments fails fast (keeps template)",
    async () => {
      const tmpl = "{argument} {argument} {argument} {argument}";
      const r = await renderTemplate(tmpl, {});
      assert(r.text === tmpl, "Expected template to be kept as-is when there are too many arguments");
      assert(r.notices.some((n) => n.kind === "too_many_arguments"), "Expected too_many_arguments notice");
    },
    failures,
  );

  await test(
    "renderTemplate: argument default works without prompt",
    async () => {
      const r = await renderTemplate('Hello {argument name="name" default="World"}!', {});
      assert(r.text === "Hello World!", `Expected default substitution, got ${JSON.stringify(r.text)}`);
    },
    failures,
  );

  await test(
    "TR35: S token outputs correct shapes",
    async () => {
      const s1 = (await renderTemplate('{date format="S"}', {})).text;
      const s2 = (await renderTemplate('{date format="SS"}', {})).text;
      const s3 = (await renderTemplate('{date format="SSS"}', {})).text;
      const s4 = (await renderTemplate('{date format="SSSS"}', {})).text;
      const s5 = (await renderTemplate('{date format="SSSSS"}', {})).text;

      assertMatch(s1, /^\d$/, "Expected S to be 1 digit");
      assertMatch(s2, /^\d{2}$/, "Expected SS to be 2 digits");
      assertMatch(s3, /^\d{3}$/, "Expected SSS to be 3 digits");
      assertMatch(s4, /^\d{4}$/, "Expected SSSS to be 4 digits");
      assertMatch(s5, /^\d{5}$/, "Expected SSSSS to be 5 digits");

      assert(s4.endsWith("0"), "Expected SSSS to end with 0 (zero-padding beyond milliseconds)");
      assert(s5.endsWith("00"), "Expected SSSSS to end with 00 (zero-padding beyond milliseconds)");
    },
    failures,
  );

  await test(
    "TR35: Z/X/x/O token outputs correct shapes",
    async () => {
      const z1 = (await renderTemplate('{date format="Z"}', {})).text;
      const z4 = (await renderTemplate('{date format="ZZZZ"}', {})).text;
      const z5 = (await renderTemplate('{date format="ZZZZZ"}', {})).text;

      assertMatch(z1, /^[+-]\d{4}$/, "Expected Z to be RFC822 offset (+HHMM)");
      assertMatch(z4, /^GMT([+-]\d{2}:\d{2})?$/, "Expected ZZZZ to be localized GMT (GMT or GMT+HH:MM)");
      assertMatch(z5, /^(Z|[+-]\d{2}:\d{2})$/, "Expected ZZZZZ to be ISO 8601 offset (+HH:MM or Z)");

      const x1 = (await renderTemplate('{date format="X"}', {})).text;
      const x3 = (await renderTemplate('{date format="XXX"}', {})).text;
      const xx3 = (await renderTemplate('{date format="xxx"}', {})).text;

      assertMatch(x1, /^(Z|[+-]\d{2}(\d{2})?)$/, "Expected X to be Z or ISO basic offset (+HH or +HHMM)");
      assertMatch(x3, /^(Z|[+-]\d{2}:\d{2})$/, "Expected XXX to be Z or ISO extended offset (+HH:MM)");
      assert(xx3 !== "Z", "Expected xxx to never use Z for zero offset");
      assertMatch(xx3, /^[+-]\d{2}:\d{2}$/, "Expected xxx to be ISO extended offset (+HH:MM)");

      const o1 = (await renderTemplate('{date format="O"}', {})).text;
      const o4 = (await renderTemplate('{date format="OOOO"}', {})).text;
      assert(o1.startsWith("GMT"), "Expected O to start with GMT");
      assertMatch(o4, /^GMT[+-]\d{2}:\d{2}$/, "Expected OOOO to be GMT+HH:MM");
    },
    failures,
  );

  await test(
    "import: Raycast JSON format (array of {name,text,keyword?})",
    () => {
      const json = JSON.stringify([{ name: "Personal Email", text: "sherlock@gmail.com", keyword: "@@" }]);
      const { mergedSnippets, report } = importFromJsonTextToStore(json, []);
      assert(report.addedCount === 1, `Expected addedCount=1, got ${report.addedCount}`);
      assert(report.failedCount === 0, `Expected failedCount=0, got ${report.failedCount}`);
      assert(mergedSnippets.length === 1, `Expected mergedSnippets length=1, got ${mergedSnippets.length}`);
      assert(mergedSnippets[0]?.title === "Personal Email", "Expected imported title to be normalized");
    },
    failures,
  );

  await test(
    "import: BOM JSON is accepted",
    () => {
      const json = "\uFEFF" + JSON.stringify([{ name: "A", text: "B" }]);
      const { report } = importFromJsonTextToStore(json, []);
      assert(report.addedCount === 1, `Expected addedCount=1, got ${report.addedCount}`);
      assert(report.failedCount === 0, `Expected failedCount=0, got ${report.failedCount}`);
    },
    failures,
  );

  await test(
    "import: dedupe keeps leading indentation but trims trailing blank lines",
    () => {
      const ts = nowIso();
      const existing: Snippet[] = [
        {
          id: "1",
          title: "T",
          content: "  foo\n\n",
          createdAt: ts,
          updatedAt: ts,
          timesCopied: 0,
        },
      ];

      // Trailing blank lines are ignored for dedupe
      const json1 = JSON.stringify([{ name: "T", text: "  foo" }]);
      const r1 = importFromJsonTextToStore(json1, existing);
      assert(r1.report.skippedCount === 1, "Expected incoming content without trailing blanks to be considered duplicate");

      // Leading indentation is preserved for dedupe (no false duplicates)
      const json2 = JSON.stringify([{ name: "T", text: "foo" }]);
      const r2 = importFromJsonTextToStore(json2, existing);
      assert(r2.report.addedCount === 1, "Expected different leading indentation to NOT be considered duplicate");
    },
    failures,
  );

  await test(
    "import: invalid JSON reports failure and keeps existing store untouched",
    () => {
      const ts = nowIso();
      const existing: Snippet[] = [
        {
          id: "1",
          title: "T",
          content: "foo",
          createdAt: ts,
          updatedAt: ts,
          timesCopied: 0,
        },
      ];
      const { mergedSnippets, report } = importFromJsonTextToStore("{not json}", existing);
      assert(report.failedCount === 1, `Expected failedCount=1, got ${report.failedCount}`);
      assert(mergedSnippets === existing, "Expected mergedSnippets to be the original array on hard failure");
    },
    failures,
  );

  if (failures.length > 0) {
    process.stderr.write(`Self-check failed (${failures.length}):\n- ${failures.join("\n- ")}\n`);
    process.exit(1);
  }

  process.stdout.write("All self-checks passed.\n");
}

main().catch((err) => {
  process.stderr.write(`Self-check crashed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});

