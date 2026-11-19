import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("exposes Depot's task-focused commands", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { commands: Array<{ name: string; title: string }> };

  assert.deepEqual(
    manifest.commands.map(({ name, title }) => ({ name, title })),
    [
      { name: "install", title: "Depot Install" },
      { name: "manage", title: "Depot Manage" },
      { name: "update", title: "Depot Update" },
      { name: "clean", title: "Depot Clean" },
    ],
  );
});
