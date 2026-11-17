import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseBash, parseFish, parseZsh, uniqueRecent, type ShellName } from "../src/lib/history";
import { decodeHistory, parseSnapshot } from "../src/lib/reader";

for (const shell of ["bash", "zsh", "fish"] as ShellName[]) {
  test(`${shell} fixture: timestamps, multiline, Unicode, dedup and frequency`, async () => {
    const bytes = await readFile(new URL(`./fixtures/${shell}.history`, import.meta.url));
    const { entries, notices } = parseSnapshot(bytes, shell, 100);
    assert.deepEqual(notices, []);
    assert.equal(entries.length, 3);
    assert.equal(entries[0].command, "docker compose up -d");
    assert.equal(entries[0].frequency, 2);
    assert.equal(entries[0].timestamp, 1700000003);
    assert.match(entries[1].command, /café 日本語/);
    assert.match(entries[2].command, /\n  printf/);
    assert.equal(entries[2].timestamp, 1700000001);
    assert.match(entries[2].command, /'%s\\n'/);
  });
}

test("Bash blank lines inside timestamped entries and untimestamped continuations", () => {
  assert.equal(parseBash("#1700000000\nprintf 'one\n\ntwo'\n")[0].command, "printf 'one\n\ntwo'");
  assert.equal(parseBash("printf one \\\n two\npwd\n")[0].command, "printf one \\\n two");
  assert.deepEqual(parseBash("printf \\\n"), []);
  assert.deepEqual(parseBash("pwd\nls\n#1700000000\necho new\n").map(item => item.command), ["pwd", "ls", "echo new"]);
});

test("Zsh restores escaped colons, padded trailing backslashes, even backslashes and negative duration", () => {
  assert.equal(parseZsh("\\: literal\n")[0].command, ": literal");
  assert.equal(parseZsh(": 1700000000:-1;echo \\ \n")[0].command, "echo \\");
  assert.equal(parseZsh(": 1700000000:0;echo \\\\\nnext\n")[0].command, "echo \\\nnext");
  assert.deepEqual(parseZsh(": 1700000000:0;unfinished\\\n"), []);
});

test("Fish unescapes once, ignores metadata, and preserves literal backslash-n", () => {
  const items = parseFish("- cmd: echo \\\\n\n  when: 1700000000\n  paths:\n    - /tmp/nope\n- cmd: one\\ntwo\n  when: 1700000001\n");
  assert.equal(items[0].command, "echo \\n");
  assert.equal(items[1].command, "one\ntwo");
  assert.equal(items[1].timestamp, 1700000001);
});

test("Zsh Meta bytes decode before UTF-8; BOM, CRLF and invalid encoding are handled", () => {
  const raw = Buffer.from("echo café 日本語\n");
  // Zsh metafies internal special bytes (including selected UTF-8 continuation bytes).
  const encoded = Buffer.from([...raw].flatMap(b => b >= 0x80 && b <= 0x9f ? [0x83, b ^ 32] : [b]));
  assert.equal(decodeHistory(encoded, "zsh"), raw.toString());
  assert.equal(parseSnapshot(Buffer.from("\ufeffpwd\r\n"), "bash", 20).entries[0].command, "pwd");
  const invalid = parseSnapshot(Buffer.from([0x65, 0x20, 0xff, 0x0a]), "bash", 20);
  assert.match(invalid.entries[0].command, /�/);
  assert.match(invalid.notices[0], /UTF-8/);
});

test("exact whitespace survives dedup and limits retain newest unique records", () => {
  const items = uniqueRecent(parseBash(" echo one\necho one\npwd\n echo one\n"), 2);
  assert.deepEqual(items.map(item => item.command), [" echo one", "pwd"]);
  assert.equal(items[0].frequency, 2);
});

test("partial final Bash/Zsh/Fish writes are never offered as command suffixes", () => {
  for (const [shell, text] of [
    ["bash", "#1700000000\npwd\n#1700000001\necho complete\necho par"],
    ["zsh", ": 1700000000:0;pwd\n: 1700000001:0;echo complete\\\necho par"],
    ["fish", "- cmd: pwd\n  when: 1700000000\n- cmd: echo complete\n  when: 17"],
  ] as const) {
    const snapshot = parseSnapshot(Buffer.from(text), shell, 20);
    assert.deepEqual(snapshot.entries.map(item => item.command), ["pwd"]);
    assert.match(snapshot.notices.join(), /unfinished/);
  }
  assert.equal(parseSnapshot(Buffer.from("#1700000000\npwd\n#1700"), "bash", 20).entries[0].command, "pwd");
  assert.equal(parseSnapshot(Buffer.from("- cmd: pwd\n  when: 1700000000\n- cmd: par"), "fish", 20).entries[0].command, "pwd");
  const continued = parseSnapshot(Buffer.from("#1700000000\npwd\n#1700000001\necho \\\n"), "bash", 20);
  assert.deepEqual(continued.entries.map(item => item.command), ["pwd"]);
  assert.match(continued.notices.join(), /unfinished/);
});

test("truncated snapshot skips a partial first record for every format", () => {
  for (const [shell, text] of [
    ["bash", "suffix\nstill suffix\n#1700000001\npwd\n"],
    ["zsh", "suffix\\\nstill suffix\n: 1700000001:0;pwd\n"],
    ["fish", "suffix\n  when: 1700000000\n- cmd: pwd\n  when: 1700000001\n"],
  ] as const) {
    const snapshot = parseSnapshot(Buffer.from(text), shell, 20, true);
    assert.deepEqual(snapshot.entries.map(item => item.command), ["pwd"]);
    assert.match(snapshot.notices.join(), /Large history/);
  }
  assert.deepEqual(parseSnapshot(Buffer.from("giant suffix"), "fish", 20, true).entries, []);
});
