import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FlatpakBackend } from "../src/backends/flatpak.ts";
import { listFlatpakUpdateRecords } from "../src/backends/flatpak-listing.ts";

const ref = "runtime/org.example.Runtime/x86_64/stable";
async function fixture(run: (backend: FlatpakBackend, executable: string, directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "depot-flatpak-safety-"));
  const executable = join(directory, "flatpak");
  await writeFile(executable, `#!/bin/sh
cd "$(dirname "$0")"
case "$1:$2" in
  remote-ls:--user) exit 0 ;;
  remote-ls:--system) echo 'system scope unavailable' >&2; exit 1 ;;
  list:*)
    printf 'org.example.Runtime/x86_64/stable\\norg.example.Other/x86_64/stable\\n'
    if [ -f ambiguous ]; then printf 'org.example.Runtime/aarch64/stable\\n'; fi ;;
  uninstall:*)
    case " $* " in
      *' --unused '*)
        read -r reply
        if [ "$2" = --system ]; then echo 'Nothing unused to uninstall';
        elif [ -f changed ]; then printf '1. org.example.Runtime stable r\\n2. org.example.Other stable r\\n';
        elif [ -f gone ]; then echo 'Nothing unused to uninstall';
        else printf '1. org.example.Runtime stable r\\n'; fi ;;
      *) printf '%s\\n' "$@" >> removed ;;
    esac ;;
  *) exit 1 ;;
esac
`, { mode: 0o700 });
  try { await run(new FlatpakBackend("user", executable), executable, directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test("cleanup removes only reviewed full refs without related extensions", async () => {
  await fixture(async (backend, _executable, directory) => {
    const preview = await backend.previewCleanup();
    assert.equal(preview[0]?.ref, ref);
    await backend.cleanUnused(preview);
    assert.deepEqual((await readFile(join(directory, "removed"), "utf8")).trim().split("\n"), [
      "uninstall", "--user", "--runtime", "--no-related", "--noninteractive", "--assumeyes", "--", ref,
    ]);
  });
});

test("cleanup rejects a changed removal set without executing a transaction", async () => {
  await fixture(async (backend, _executable, directory) => {
    const preview = await backend.previewCleanup();
    await writeFile(join(directory, "gone"), "");
    await assert.rejects(backend.cleanUnused(preview), /changed since review/);
    await assert.rejects(readFile(join(directory, "removed")), { code: "ENOENT" });
  });
});

test("cleanup rejects newly unused runtimes outside the reviewed set", async () => {
  await fixture(async (backend, _executable, directory) => {
    const preview = await backend.previewCleanup();
    await writeFile(join(directory, "changed"), "");
    await assert.rejects(backend.cleanUnused(preview), /changed since review/);
    await assert.rejects(readFile(join(directory, "removed")), { code: "ENOENT" });
  });
});

for (const cached of [true, false]) {
  test(`reports a failed update scope (cached=${cached})`, async () => {
    await fixture(async (_backend, executable) => {
      await assert.rejects(listFlatpakUpdateRecords(executable, ["user", "system"], cached), /could not be loaded/);
    });
  });
}


test("cleanup rejects ambiguous architectures before offering removal", async () => {
  await fixture(async (backend, _executable, directory) => {
    await writeFile(join(directory, "ambiguous"), "");
    await assert.rejects(backend.previewCleanup(), /identified safely/);
    await assert.rejects(readFile(join(directory, "removed")), { code: "ENOENT" });
  });
});
