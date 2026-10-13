import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FlatpakBackend } from "../src/backends/flatpak.ts";

test("returns successful Flatpak scope results with a partial-failure warning", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depot-flatpak-search-test-"));
  const executable = join(directory, "flatpak-fixture");
  try {
    await writeFile(executable, [
      "#!/bin/sh",
      "case \"$1:$2\" in",
      "  remotes:--user) printf 'flathub\\n' ;;",
      "  remotes:--system) printf 'company\\n' ;;",
      "  list:*) exit 0 ;;",
      "  search:--user) printf 'VLC\\tMedia player\\torg.videolan.VLC\\t3.0\\tstable\\tflathub\\n' ;;",
      "  search:--system) printf 'system search failed\\n' >&2; exit 1 ;;",
      "  *) exit 1 ;;",
      "esac",
    ].join("\n"), { mode: 0o700 });

    const result = await new FlatpakBackend("user", executable)
      .searchWithStatus("vlc");

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.id, "org.videolan.VLC");
    assert.match(result.warning ?? "", /system search failed.*partial results/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
