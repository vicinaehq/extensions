import assert from "node:assert/strict";

test("large valid plaintext results with many backticks render without exhausting the stack", () => {
  const value = "`a".repeat(200_000);
  assert.equal(plainTextMarkdown(value), "\\`a".repeat(200_000));
});
import { test } from "node:test";
import {
  inputSources,
  plainTextMarkdown,
  refinementPrompt,
  renderTemplate,
} from "../src/core/template";
import { Repository, type StoragePort } from "../src/core/repository";
import { DEFAULT_SYSTEM_PROMPT, MAX_TEXT_LENGTH } from "../src/core/types";
import { pasteResult, type PastePort } from "../src/core/paste";

export const values = {
  name: "Translate",
  prompt: "Translate {selection}",
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  harness: "codex" as const,
  model: "model-from-cli",
  effort: "low",
};

function memoryStorage(): StoragePort {
  const data: Record<string, string> = {};
  return {
    allItems: async () => ({ ...data }),
    getItem: async (key) => data[key],
    setItem: async (key, value) => {
      data[key] = value;
    },
    removeItem: async (key) => {
      delete data[key];
    },
  };
}

test("templates preserve literal replacements, Unicode, whitespace, and unknown braces", () => {
  assert.equal(
    renderTemplate("{selection}\n{clipboard}\n{selection}\n{language}", {
      selection: "  Привет $& {clipboard}\n",
      clipboard: "quoted `text`",
    }),
    "  Привет $& {clipboard}\n\nquoted `text`\n  Привет $& {clipboard}\n\n{language}",
  );
  assert.deepEqual(
    inputSources("{selection} {selection} {clipboard} {language}"),
    ["selection", "clipboard"],
  );
});

test("missing selection cannot silently substitute clipboard; only referenced input is required", () => {
  assert.throws(
    () => renderTemplate("{selection}", { clipboard: "unrelated" }),
    /No selected text/,
  );
  assert.throws(
    () => renderTemplate("{clipboard}", { selection: "text" }),
    /clipboard does not contain/,
  );
  assert.equal(renderTemplate("{clipboard}", { clipboard: "  a\n" }), "  a\n");
  assert.equal(renderTemplate("Say hello", {}), "Say hello");
  assert.throws(
    () =>
      renderTemplate("{selection}", {
        selection: "a".repeat(MAX_TEXT_LENGTH + 1),
      }),
    /too large/,
  );
});

test("result preview treats Markdown, HTML and fences as literal text", () => {
  const text =
    "![remote](https://example.com/pixel)\n```\n<script>bad()</script>\n````";
  const rendered = plainTextMarkdown(text);
  assert.ok(rendered.startsWith("\\!\\[remote\\]\\("));
  assert.ok(rendered.includes("&lt;script&gt;bad\\(\\)&lt;/script&gt;"));
  assert.ok(!rendered.includes("```"));
  assert.ok(rendered.includes("  \n"));
  assert.equal(plainTextMarkdown("hello\n===="), "hello  \n\\=\\=\\=\\=");
  assert.equal(
    plainTextMarkdown("# title\r\n    indented\n1. item &amp;"),
    "\\# title  \n&#160;&#160;&#160;&#160;indented  \n1\\. item &amp;amp;",
  );
});

test("refinement includes the original request and previous answer without changing snapshots", () => {
  const prompt = refinementPrompt("Translate: Привет", "Hello", "Less formal");
  assert.ok(prompt.includes("Привет"));
  assert.ok(prompt.includes("Hello"));
  assert.ok(prompt.endsWith("Less formal"));
  assert.throws(() => refinementPrompt("a", "b", " "), /Write an instruction/);
});

test("independent creates, edits, deletion, and stale Quicklinks", async () => {
  const storage = memoryStorage();
  const first = new Repository(storage),
    second = new Repository(storage);
  const [one, two] = await Promise.all([
    first.saveCommand(values),
    second.saveCommand({ ...values, name: "Rewrite" }),
  ]);
  assert.equal((await first.commands()).length, 2);
  const edited = await first.saveCommand(
    { ...values, name: "Translate to English" },
    one,
  );
  assert.equal(edited.id, one.id);
  assert.equal(edited.createdAt, one.createdAt);
  assert.equal((await second.command(one.id)).name, "Translate to English");
  await second.deleteCommand(two.id);
  await assert.rejects(first.command(two.id), /no longer exists/);
});

test("history pruning and clearing preserve commands and unrelated extension keys", async () => {
  const storage = memoryStorage(),
    repository = new Repository(storage);
  await storage.setItem("unrelated", "keep");
  const command = await repository.saveCommand(values);
  for (let index = 0; index < 103; index++)
    await repository.saveHistory({
      command,
      input: { selection: `${index}` },
      renderedPrompt: `${index}`,
      result: `Result ${index}`,
    });
  assert.equal((await repository.history()).length, 100);
  await repository.clearHistory();
  assert.equal((await repository.history()).length, 0);
  assert.equal((await repository.commands()).length, 1);
  assert.equal(await storage.getItem("unrelated"), "keep");
});

test("corrupt stored commands fail visibly without overwriting data", async () => {
  const storage = memoryStorage(),
    repository = new Repository(storage);
  await storage.setItem("ai-command:v1:broken", "{not json");
  await assert.rejects(repository.commands(), /unreadable/);
  assert.equal(await storage.getItem("ai-command:v1:broken"), "{not json");
});

function pastePort(events: string[]): PastePort {
  return {
    sourceExists: async () => true,
    close: async () => {
      events.push("close");
    },
    focus: async (id) => {
      events.push(`focus:${id}`);
      return true;
    },
    activeWindowId: async () => "source",
    paste: async (text) => {
      events.push(`paste:${text}`);
    },
  };
}

test("Enter flow closes, restores source focus, then pastes exact text once", async () => {
  const events: string[] = [];
  await pasteResult("  Привет\n", "source", pastePort(events));
  assert.deepEqual(events, ["close", "focus:source", "paste:  Привет\n"]);
});

test("closed or unfocusable source windows never receive a paste", async () => {
  const events: string[] = [];
  await assert.rejects(
    pasteResult("text", "source", {
      ...pastePort(events),
      sourceExists: async () => false,
    }),
    /source window has closed/,
  );
  assert.deepEqual(events, []);
  await assert.rejects(
    pasteResult("text", "source", {
      ...pastePort(events),
      focus: async () => false,
    }),
    /Could not focus/,
  );
  assert.deepEqual(events, ["close"]);
});

test("focus mismatch does not paste into another app", async () => {
  const events: string[] = [];
  await assert.rejects(
    pasteResult("text", "source", {
      ...pastePort(events),
      activeWindowId: async () => "other",
    }),
    /did not regain focus/,
  );
  assert.ok(!events.some((event) => event.startsWith("paste:")));
});
