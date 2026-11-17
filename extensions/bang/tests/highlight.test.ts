import { test } from "node:test";
import assert from "node:assert/strict";
import { styledCommandTitle } from "../src/lib/highlight";
import { createHistorySearch, createHistorySearchWithMatches } from "../src/lib/rank";
import type { HistoryEntry } from "../src/lib/history";

function search(command: string) {
  return createHistorySearchWithMatches([{ command, source: "bash" }]);
}

test("fuzzy ranges identify original characters, merge adjacent matches and prefer contiguous occurrences", () => {
  const [{ item, ranges }] = search("docker compose up -d")(" DCK CMP ");
  assert.equal(item.command, "docker compose up -d");
  assert.deepEqual(ranges, [
    { start: 0, end: 1 }, { start: 2, end: 4 }, { start: 6, end: 8 }, { start: 9, end: 11 },
  ]);
  assert.equal(styledCommandTitle(item.command, ranges),
    "<b></b><b><u>d</u></b>o<b><u>ck</u></b>er<b><u>&nbsp;c</u></b>o<b><u>mp</u></b>ose&nbsp;up&nbsp;-d");
  assert.deepEqual(search("axb ab")("ab")[0].ranges, [{ start: 4, end: 6 }]);
  assert.deepEqual(search("echo '[hello]'")("[h]")[0].ranges,
    [{ start: 6, end: 8 }, { start: 12, end: 13 }]);
  assert.deepEqual(search("Docker")("DOCK")[0].ranges, [{ start: 0, end: 4 }]);
  assert.deepEqual(search("docker")("missing"), []);
});

test("blank queries have no highlights and existing search wrappers retain entry identity and limits", () => {
  const entries: HistoryEntry[] = [{ command: "one", source: "bash" }, { command: "two", source: "fish" }];
  const withMatches = createHistorySearchWithMatches(entries);
  assert.deepEqual(withMatches(" \t ", 1), [{ item: entries[0], ranges: [] }]);
  assert.strictEqual(createHistorySearch(entries)("one")[0], entries[0]);
  assert.deepEqual(withMatches("o", 0), []);
});

test("case-fold expansion, contextual casing and astral characters map to original UTF-16 offsets", () => {
  assert.deepEqual(search("İx")("x")[0].ranges, [{ start: 1, end: 2 }]);
  assert.deepEqual(search("İx")("i\u0307x")[0].ranges, [{ start: 0, end: 2 }]);
  assert.deepEqual(search("İx")("\u0307")[0].ranges, [{ start: 0, end: 1 }]);
  assert.deepEqual(search("ΟΣ x")("ος")[0].ranges, [{ start: 0, end: 2 }]);
  assert.deepEqual(search("😀x😀")("😀😀")[0].ranges, [{ start: 0, end: 2 }, { start: 3, end: 5 }]);
  assert.deepEqual(search("İ😀x")("😀x")[0].ranges, [{ start: 1, end: 4 }]);
  assert.deepEqual(search("𐐀x")("𐐨x")[0].ranges, [{ start: 0, end: 3 }]);
});

test("titles highlight whole graphemes, combining marks and emoji sequences", () => {
  assert.equal(styledCommandTitle("cafe\u0301", [{ start: 3, end: 4 }]), "<b></b>caf<b><u>e\u0301</u></b>");
  assert.equal(styledCommandTitle("👩‍💻 ok", [{ start: 2, end: 3 }]), "<b></b><b><u>👩‍💻</u></b>&nbsp;ok");
});

test("all untrusted markup and entities are escaped, including when no query matches", () => {
  const command = `echo  '<img src="https://example.invalid/x">' & <b>x</b> &lt;`;
  const title = styledCommandTitle(command);
  assert.equal(title, "<b></b>echo&nbsp;&nbsp;&#39;&lt;img&nbsp;src=&quot;https://example.invalid/x&quot;&gt;&#39;&nbsp;&amp;&nbsp;&lt;b&gt;x&lt;/b&gt;&nbsp;&amp;lt;");
  const marked = styledCommandTitle(command, [{ start: 7, end: 11 }]);
  assert.match(marked, /<b><u>&lt;img<\/u><\/b>/);
  assert.doesNotMatch(marked, /<img|<a\b|src="/);
});

test("sensitive commands stay fully redacted even when the query matches a secret", () => {
  const command = "TOKEN=synthetic-secret echo ok";
  assert.equal(styledCommandTitle(command, search(command)("secret")[0].ranges), "Sensitive command — review to reveal");
  assert.equal(styledCommandTitle(command), "Sensitive command — review to reveal");
});

test("control characters are visible and bounded titles never split graphemes, entities or tags", () => {
  assert.equal(styledCommandTitle("a\nb\tc\u0000\u202ed"), "<b></b>a&nbsp;↵&nbsp;b&nbsp;⇥&nbsp;c��d");
  assert.equal(styledCommandTitle("a".repeat(219) + "😀"), "<b></b>" + "a".repeat(219) + "…");
  assert.equal(styledCommandTitle("a".repeat(219) + "e\u0301"), "<b></b>" + "a".repeat(219) + "…");
  assert.equal(styledCommandTitle("<".repeat(221), [{ start: 0, end: 221 }]),
    "<b></b><b><u>" + "&lt;".repeat(220) + "</u></b>…");
  assert.equal(styledCommandTitle("a".repeat(220)), "<b></b>" + "a".repeat(220));
  assert.equal(styledCommandTitle("a".repeat(220) + "x", [{ start: 220, end: 221 }]),
    "<b></b>" + "a".repeat(220) + "…");
});
