import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { chmod, link, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { parse } from "jsonc-parser";
import { aliasSetupError, aliasTarget, applyAliasSetup, defaultAliasConfigPath, planAliasSetup } from "../src/lib/alias-setup";

const target = { provider: "@tester/bang", command: "bang" as const };
async function fixture(t: TestContext, content: string | Buffer = "{}") {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bang-alias-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "settings.json");
  await writeFile(file, content, { mode: 0o600 });
  return { directory, file };
}

test("alias setup resolves XDG paths and local/store provider IDs without hard-coding the author", () => {
  assert.equal(defaultAliasConfigPath({}, "/home/test"), "/home/test/.config/vicinae/settings.json");
  assert.equal(defaultAliasConfigPath({ XDG_CONFIG_HOME: "/config" }, "/home/test"), "/config/vicinae/settings.json");
  assert.equal(defaultAliasConfigPath({ XDG_CONFIG_HOME: "relative" }, "/home/test"), "/home/test/.config/vicinae/settings.json");
  assert.deepEqual(aliasTarget("tester", "/data/extensions/bang/assets"), target);
  assert.deepEqual(aliasTarget("tester", "/data/extensions/store.vicinae.bang/assets"), { provider: "@tester/store.vicinae.bang", command: "bang" });
  assert.throws(() => aliasTarget("", "/data/bang/assets"), { code: "target" });
});

test("opt-in setup preserves JSONC comments, unrelated settings and permissions, with an exact private backup", async t => {
  const original = '// Keep this comment\r\n{\r\n  "providers": {\r\n    "@tester/bang": {"preferences": {"confirmBeforeRun": false}, "entrypoints": {"bang": {"shortcut": "ctrl+alt+b"}}},\r\n    "apps": {"entrypoints": {"other": {"alias": "other"}}}\r\n  },\r\n  "custom": {"secret": "synthetic-private-value"}\r\n}\r\n';
  const { directory, file } = await fixture(t, original);
  await chmod(file, 0o640);
  const plan = await planAliasSetup(file, target, {});
  assert.equal(await readFile(file, "utf8"), original); // planning is read-only
  assert.deepEqual(await readdir(directory), ["settings.json"]);
  const result = await applyAliasSetup(plan);
  assert.equal(result.changed, true);
  assert.equal(await readFile(result.backupPath!, "utf8"), original);
  assert.equal((await stat(result.backupPath!)).mode & 0o777, 0o600);
  assert.equal((await stat(file)).mode & 0o777, 0o640);
  const updated = await readFile(file, "utf8");
  assert.ok(updated.includes("// Keep this comment\r\n"));
  assert.equal(updated.replace(/\r\n/g, "").includes("\n"), false);
  const expected = parse(original);
  expected.providers[target.provider].entrypoints.bang.alias = "!";
  assert.deepEqual(parse(updated), expected);
  assert.equal((await readdir(directory)).filter(name => name.endsWith(".tmp") || name.endsWith(".lock")).length, 0);
});

test("existing ! alias is idempotent, with no rewrite or extra backup", async t => {
  const original = JSON.stringify({ providers: { [target.provider]: { entrypoints: { bang: { alias: "!" } } } } });
  const { directory, file } = await fixture(t, original);
  const before = await stat(file);
  assert.deepEqual(await applyAliasSetup(await planAliasSetup(file, target, {})), { changed: false });
  assert.equal(await readFile(file, "utf8"), original);
  assert.equal((await stat(file)).mtimeMs, before.mtimeMs);
  assert.deepEqual(await readdir(directory), ["settings.json"]);
});

test("setup creates only the missing nested alias fields, including in BOM-prefixed JSONC", async t => {
  const { file } = await fixture(t, "\ufeff// preserved\n{}\n");
  await applyAliasSetup(await planAliasSetup(file, target, {}));
  const updated = await readFile(file, "utf8");
  assert.ok(updated.startsWith("\ufeff// preserved\n"));
  assert.equal(parse(updated.slice(1)).providers[target.provider].entrypoints.bang.alias, "!");
});

test("alias conflicts, existing Bang aliases and disabled targets are never overwritten", async t => {
  const { directory, file } = await fixture(t);
  for (const [providers, code] of [
    [{ other: { entrypoints: { run: { alias: "!" } } } }, "conflict"],
    [{ other: { enabled: false, entrypoints: { run: { alias: "!" } } } }, "conflict"],
    [{ [target.provider]: { entrypoints: { bang: { alias: "old" } } } }, "existing"],
    [{ [target.provider]: { enabled: false } }, "disabled"],
    [{ [target.provider]: { entrypoints: { bang: { enabled: false } } } }, "disabled"],
  ] as const) {
    const original = JSON.stringify({ providers });
    await writeFile(file, original);
    await assert.rejects(planAliasSetup(file, target, {}), { code });
    assert.equal(await readFile(file, "utf8"), original);
    assert.deepEqual(await readdir(directory), ["settings.json"]);
  }
});

test("imports and environment overrides are refused rather than guessing at effective aliases", async t => {
  const { directory, file } = await fixture(t, '{"imports":["./managed.json"]}');
  await assert.rejects(planAliasSetup(file, target, {}), { code: "unsupported" });
  await writeFile(file, "{}");
  await assert.rejects(planAliasSetup(file, target, { VICINAE_OVERRIDES: "/managed.json" }), { code: "unsupported" });
  assert.deepEqual(await readdir(directory), ["settings.json"]);
});

test("invalid UTF-8, malformed JSON, duplicate keys and malformed alias maps cause no changes", async t => {
  const { directory, file } = await fixture(t);
  for (const original of [
    "[]", "{bad", '{"providers":{},"providers":{}}',
    '{"providers":{"other":{"entrypoints":{"cmd":{"alias":"one","alias":"!"}}}}}',
    '{"providers":[]}', '{"providers":{"other":{"entrypoints":{"cmd":{"alias":5}}}}}',
    Buffer.from([0x7b, 0xff, 0x7d]),
  ]) {
    await writeFile(file, original);
    await assert.rejects(planAliasSetup(file, target, {}), { code: "invalid" });
    assert.deepEqual(await readFile(file), Buffer.from(original));
    assert.deepEqual(await readdir(directory), ["settings.json"]);
  }
});

test("symlinks, linked parents, hardlinks, FIFO, oversized and missing files are refused", async t => {
  const { directory, file } = await fixture(t);
  const linkedFile = path.join(directory, "linked.json");
  await symlink(file, linkedFile);
  await assert.rejects(planAliasSetup(linkedFile, target, {}), { code: "unsupported" });
  const linkedParent = path.join(directory, "linked-parent");
  const actualParent = path.join(directory, "actual-parent");
  await mkdir(actualParent);
  await writeFile(path.join(actualParent, "settings.json"), "{}");
  await symlink(actualParent, linkedParent);
  await assert.rejects(planAliasSetup(path.join(linkedParent, "settings.json"), target, {}), { code: "unsupported" });
  await link(file, path.join(directory, "hardlink.json"));
  await assert.rejects(planAliasSetup(file, target, {}), { code: "unsupported" });
  const fifo = path.join(directory, "fifo");
  execFileSync("mkfifo", [fifo]);
  await assert.rejects(planAliasSetup(fifo, target, {}), { code: "unsupported" });
  const huge = path.join(directory, "huge.json");
  await writeFile(huge, " ".repeat(1024 * 1024 + 1));
  await assert.rejects(planAliasSetup(huge, target, {}), { code: "unsupported" });
  await assert.rejects(planAliasSetup(path.join(directory, "missing.json"), target, {}), { code: "ENOENT" });
  assert.equal(await readFile(file, "utf8"), "{}");
  assert.equal((await readdir(directory)).some(name => name.includes(".bang-backup-")), false);
});

test("changed settings abort before backup/replacement, preserving the concurrent writer", async t => {
  const { directory, file } = await fixture(t);
  const plan = await planAliasSetup(file, target, {});
  const concurrent = '{"providers":{"other":{"entrypoints":{"new":{"alias":"!"}}}}}';
  await writeFile(file, concurrent);
  await assert.rejects(applyAliasSetup(plan), { code: "changed" });
  assert.equal(await readFile(file, "utf8"), concurrent);
  assert.deepEqual(await readdir(directory), ["settings.json"]);
});

test("another setup's lock is not replaced or removed", async t => {
  const { directory, file } = await fixture(t);
  const plan = await planAliasSetup(file, target, {});
  const lock = `${file}.bang-alias.lock`;
  await writeFile(lock, "another setup", { mode: 0o600 });
  await assert.rejects(applyAliasSetup(plan), { code: "locked" });
  assert.equal(await readFile(lock, "utf8"), "another setup");
  assert.equal(await readFile(file, "utf8"), "{}");
  assert.equal((await readdir(directory)).some(name => name.includes(".bang-backup-")), false);
});

test("read-only config is not replaced even if its directory is writable", async t => {
  if (process.getuid?.() === 0) { t.skip("Root can bypass file write permissions"); return; }
  const { directory, file } = await fixture(t);
  await chmod(file, 0o400);
  const plan = await planAliasSetup(file, target, {});
  await assert.rejects(applyAliasSetup(plan), { code: "EACCES" });
  assert.equal(await readFile(file, "utf8"), "{}");
  assert.equal((await lstat(file)).mode & 0o777, 0o400);
  assert.deepEqual(await readdir(directory), ["settings.json"]);
});

test("setup feedback never exposes raw config or filesystem errors", () => {
  assert.doesNotMatch(aliasSetupError(new Error("synthetic-private-config")), /synthetic-private-config/);
  assert.match(aliasSetupError({ code: "ENOENT" }), /not found/);
  assert.match(aliasSetupError({ code: "EACCES" }), /not writable/);
});
