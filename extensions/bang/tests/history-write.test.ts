import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseSnapshot, readHistory } from "../src/lib/reader";
import type { ShellName } from "../src/lib/history";

const { appendHistory, serializeHistoryRecord } = createRequire(import.meta.url)("../assets/history.cjs") as {
  appendHistory: (history: { path: string; shell: ShellName }, command: string, timestamp?: number) => void;
  serializeHistoryRecord: (command: string, shell: ShellName, timestamp: number) => Buffer;
};

for (const shell of ["bash", "zsh", "fish"] as const) {
  test(`${shell}: new executed commands round-trip without losing Unicode, quotes, whitespace or multiline syntax`, async t => {
    const directory = await mkdtemp(path.join(tmpdir(), "bang-history-write-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const file = path.join(directory, "history");
    const commands = ["echo 'café 日本語 😀'", "printf '%s\\n' 'one' | cat\nprintf '%s' 'two'", " echo leading space", "echo \\\\", "echo \\  ", "echo trailing newline\n"];
    for (const command of commands) appendHistory({ path: file, shell }, command, 1700000000);
    const snapshot = await readHistory(file, shell, 100);
    assert.deepEqual(snapshot.notices, []);
    assert.deepEqual(snapshot.entries.map(item => item.command), commands.slice().reverse());
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    appendHistory({ path: file, shell }, commands[0], 1700000001);
    const repeated = await readHistory(file, shell, 100);
    assert.equal(repeated.entries[0].frequency, 2);
    assert.equal(repeated.entries[0].timestamp, 1700000001);
  });
}

test("appending preserves existing entries and refuses incomplete files, FIFOs and directories", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "bang-history-append-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "history");
  await writeFile(file, "pwd\nls\n");
  appendHistory({ path: file, shell: "bash" }, "echo new", 1700000000);
  assert.deepEqual((await readHistory(file, "bash", 100)).entries.map(item => item.command), ["echo new", "ls", "pwd"]);
  await writeFile(file, "unfinished");
  assert.throws(() => appendHistory({ path: file, shell: "bash" }, "echo unsafe suffix"));
  assert.equal(await readFile(file, "utf8"), "unfinished");
  assert.throws(() => appendHistory({ path: directory, shell: "bash" }, "echo test"));
  const fifo = path.join(directory, "fifo");
  execFileSync("mkfifo", [fifo]);
  assert.throws(() => appendHistory({ path: fifo, shell: "bash" }, "echo test"));
  assert.throws(() => serializeHistoryRecord("cat <<'EOF'\n#1700000000\nEOF", "bash", 1700000001));
});

test("Zsh's own history reader accepts the serialized Unicode and multiline record", async t => {
  try { execFileSync("which", ["zsh"], { stdio: "ignore" }); }
  catch { t.skip("Zsh is not installed"); return; }
  const directory = await mkdtemp(path.join(tmpdir(), "bang-zsh-roundtrip-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "history");
  const command = "printf '%s\\n' '日本語 😀'\nprintf '%s' 'literal \\ and spaces'";
  appendHistory({ path: file, shell: "zsh" }, command, 1700000000);
  const result = execFileSync("zsh", ["-f", "-c", 'zmodload zsh/parameter; fc -p; fc -R "$1"; print -rn -- "${history[1]}"', "bang-test", file], { encoding: "utf8", env: { HOME: directory, PATH: process.env.PATH, ZDOTDIR: directory } });
  assert.equal(result, command);
  assert.equal(parseSnapshot(await readFile(file), "zsh", 20).entries[0].command, command);
});

test("Bash's timestamp-enabled history reader accepts the saved multiline record", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "bang-bash-roundtrip-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "history");
  const command = "printf '%s\\n' '日本語 😀'\nprintf '%s' 'two'";
  appendHistory({ path: file, shell: "bash" }, command, 1700000000);
  // Bash only joins timestamp-delimited physical lines when HISTTIMEFORMAT is
  // assigned (even an empty value). Bang itself always parses these boundaries.
  const result = execFileSync("bash", ["--noprofile", "--norc", "-c", 'HISTTIMEFORMAT=; history -c; history -r "$1"; history -p "!!"', "bang-test", file], { encoding: "utf8", env: { HOME: directory, PATH: process.env.PATH } });
  assert.equal(result, command + "\n");
});
