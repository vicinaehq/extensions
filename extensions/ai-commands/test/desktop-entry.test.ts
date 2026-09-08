import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  desktopEntryPath,
  desktopEntryText,
  publishDesktopEntry,
  removeDesktopEntry,
  migrateDesktopEntry,
  withDesktopEntriesRemoved,
} from "../src/core/desktop-entry";
import type { AICommand } from "../src/core/types";

const command: AICommand = {
  schemaVersion: 1,
  id: "11111111-2222-4333-8444-555555555555",
  name: "Перевести на английский",
  prompt: "{selection}",
  systemPrompt: "",
  harness: "claude",
  model: "default",
  effort: "",
  createdAt: "now",
  updatedAt: "now",
};

test("saving, renaming, and deleting a command keep a single main-search entry and preserve other apps", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-desktop-test-"));
  const options = {
    directory,
    entrypoint: "@owner/ai-commands:run-ai-command",
    executable: "/usr/bin/vicinae",
    icon: "/tmp/icon.svg",
  };
  try {
    const other = join(directory, "unrelated.desktop");
    await writeFile(other, "Unrelated app");
    await publishDesktopEntry(command, options);
    await publishDesktopEntry({ ...command, name: "Rephrase" }, options);
    assert.equal((await readdir(directory)).length, 2);
    const text = await readFile(desktopEntryPath(command.id, options), "utf8");
    assert.ok(text.includes("Name=Rephrase\n"));
    assert.ok(
      text.includes('"cmd" "launch" "@owner/ai-commands:run-ai-command"'),
    );
    assert.ok(!text.includes("{selection}"));
    await removeDesktopEntry(command.id, options);
    await removeDesktopEntry(command.id, options);
    assert.deepEqual(await readdir(directory), ["unrelated.desktop"]);
    assert.equal(await readFile(other, "utf8"), "Unrelated app");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("failed command deletion restores both original entries and refuses unowned legacy files before removal", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai-delete-"));
  const privateOptions = {
    directory: join(root, "private"),
    entrypoint: "@owner/ai:run",
    executable: "/usr/bin/vicinae",
    icon: "/icon.svg",
  };
  const legacyOptions = { ...privateOptions, directory: join(root, "public") };
  try {
    await publishDesktopEntry(command, privateOptions);
    await publishDesktopEntry(command, legacyOptions);
    const files = [privateOptions, legacyOptions].map((options) =>
      desktopEntryPath(command.id, options),
    );
    const before = await Promise.all(
      files.map((path) => readFile(path, "utf8")),
    );
    await assert.rejects(
      withDesktopEntriesRemoved(
        command.id,
        [privateOptions, legacyOptions],
        async () => {
          throw new Error("Storage failed");
        },
      ),
      /Storage failed/,
    );
    assert.deepEqual(
      await Promise.all(files.map((path) => readFile(path, "utf8"))),
      before,
    );
    await writeFile(files[1]!, "User replacement");
    let removed = false;
    await assert.rejects(
      withDesktopEntriesRemoved(
        command.id,
        [privateOptions, legacyOptions],
        async () => {
          removed = true;
        },
      ),
      /Nothing has been removed/,
    );
    assert.equal(removed, false);
    assert.equal(await readFile(files[0]!, "utf8"), before[0]);
    assert.equal(await readFile(files[1]!, "utf8"), "User replacement");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("desktop data cannot inject a new key, path traversal, or shell command", () => {
  const options = {
    directory: "/tmp/apps",
    entrypoint: "@owner/ai-commands:run-ai-command",
    executable: '/tmp/dir $x/"launcher"',
    icon: "/tmp/icon.svg",
  };
  const text = desktopEntryText(
    { ...command, name: "Hello\nExec=bad", id: '../../evil" $x %f' },
    options,
  );
  assert.equal(
    text.split("\n").filter((line) => line.startsWith("Exec=")).length,
    2,
  );
  assert.ok(text.includes("Name=Hello Exec=bad\n"));
  assert.ok(text.includes("%%f"));
  assert.throws(
    () =>
      desktopEntryText(command, {
        ...options,
        executable: "/tmp/bin%name/vicinae",
      }),
    /paths containing %/,
  );
  assert.match(
    desktopEntryPath("../../evil", options),
    /^\/tmp\/apps\/vicinae-ai-command-[a-f0-9]+\.desktop$/,
  );
});

test("private entry exposes an Edit action with the original command ID and no prompt text", () => {
  const text = desktopEntryText(command, {
    directory: "/private/applications",
    entrypoint: "@owner/ai:run-ai-command",
    executable: "/usr/bin/vicinae",
    icon: "/icon.svg",
  });
  assert.match(text, /Actions=edit;\n/);
  assert.match(text, /\[Desktop Action edit\]\nName=Edit AI Command\n/);
  assert.ok(text.includes(`"${command.id}" "edit"`));
  assert.ok(!text.includes(command.prompt));
});

test("migration publishes privately before removing only the matching owned legacy entry", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-migration-"));
  const legacy = join(directory, "public");
  const options = {
    directory: join(directory, "private"),
    entrypoint: "@owner/ai:run-ai-command",
    executable: "/usr/bin/vicinae",
    icon: "/icon.svg",
  };
  try {
    await publishDesktopEntry(command, { ...options, directory: legacy });
    await migrateDesktopEntry(command, options, legacy);
    assert.deepEqual(await readdir(legacy), []);
    assert.match(
      await readFile(desktopEntryPath(command.id, options), "utf8"),
      /Name=Edit AI Command/,
    );
    await migrateDesktopEntry(command, options, legacy);
    // A replaced destination must not cause deletion of the working public entry.
    await publishDesktopEntry(command, { ...options, directory: legacy });
    await writeFile(
      desktopEntryPath(command.id, options),
      "Someone else's file",
    );
    await assert.rejects(
      migrateDesktopEntry(command, options, legacy),
      /not been overwritten/,
    );
    assert.match(
      await readFile(
        desktopEntryPath(command.id, { ...options, directory: legacy }),
        "utf8",
      ),
      /X-Vicinae-AI-Commands=true/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("deletion refuses a launcher file whose ownership marker was removed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-desktop-test-"));
  const options = {
    directory,
    entrypoint: "@owner/ai-commands:run-ai-command",
    executable: "/usr/bin/vicinae",
    icon: "/tmp/icon.svg",
  };
  try {
    const path = desktopEntryPath(command.id, options);
    await writeFile(path, "Unrelated replacement");
    await assert.rejects(
      removeDesktopEntry(command.id, options),
      /not been removed/,
    );
    await assert.rejects(
      publishDesktopEntry(command, options),
      /not been overwritten/,
    );
    assert.equal(await readFile(path, "utf8"), "Unrelated replacement");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
