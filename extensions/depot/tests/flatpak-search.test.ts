import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

test("resolves exact package IDs and installs one remote group together", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depot-flatpak-batch-test-"));
  const executable = join(directory, "flatpak-fixture");
  const marker = join(directory, "installed");
  const log = join(directory, "install.log");
  try {
    await writeFile(executable, [
      "#!/bin/sh",
      `marker='${marker}'`,
      `log='${log}'`,
      "case \"$1:$2\" in",
      "  remotes:--user) printf 'flathub\\n' ;;",
      "  remotes:--system) exit 0 ;;",
      "  list:*)",
      "    if [ -f \"$marker\" ]; then",
      "      printf 'org.example.One\\tstable\\tflathub\\tuser\\n'",
      "      printf 'org.example.Two\\tstable\\tflathub\\tuser\\n'",
      "    fi",
      "    ;;",
      "  search:--user)",
      "    case \"$5\" in",
      "      org.example.One) printf 'One\\tFirst app\\torg.example.One\\t1.0\\tstable\\tflathub\\n' ;;",
      "      org.example.Two) printf 'Two\\tSecond app\\torg.example.Two\\t2.0\\tstable\\tflathub\\n' ;;",
      "    esac",
      "    ;;",
      "  install:--user) printf '%s\\n' \"$*\" >> \"$log\"; touch \"$marker\" ;;",
      "  *) exit 0 ;;",
      "esac",
    ].join("\n"), { mode: 0o700 });

    const backend = new FlatpakBackend("user", executable);
    const resolved = await backend.resolvePackageIds([
      { id: "org.example.One", remote: "flathub" },
      { id: "org.example.Two", remote: "flathub" },
    ]);
    assert.equal(resolved.size, 2);
    assert.equal(
      (await backend.resolvePackageIds([{
        id: "org.example.One",
        remote: "company",
      }])).size,
      0,
    );

    const outcome = await backend.installMany([...resolved.values()]);
    assert.deepEqual(
      new Set(outcome.installedIds),
      new Set(["org.example.One", "org.example.Two"]),
    );
    const commands = (await readFile(log, "utf8")).trim().split("\n");
    assert.equal(commands.length, 1);
    assert.match(commands[0] ?? "", /org\.example\.One.*org\.example\.Two/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

/** Runs `body` with a fake Flatpak whose `case "$1:$2"` arms are `arms`. */
async function withFlatpakFixture(
  arms: string[],
  body: (executable: string, readLog: () => Promise<string[]>) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "depot-flatpak-fixture-"));
  const executable = join(directory, "flatpak-fixture");
  const log = join(directory, "calls.log");
  try {
    await writeFile(executable, [
      "#!/bin/sh",
      `printf '%s\\n' "$*" >> '${log}'`,
      "case \"$1:$2\" in",
      ...arms,
      "  *) exit 0 ;;",
      "esac",
    ].join("\n"), { mode: 0o700 });
    const readLog = async () =>
      (await readFile(log, "utf8").catch(() => "")).trim().split("\n").filter(Boolean);
    await body(executable, readLog);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("an absent Flatpak yields empty results without an error", async () => {
  const backend = new FlatpakBackend("user", "/definitely/missing-flatpak");
  assert.deepEqual(await backend.searchWithStatus("vlc"), { items: [] });
  assert.deepEqual(await backend.listInstalled(), []);
  assert.equal(await backend.isAvailable(), false);
});

test("Flatpak without remotes yields empty results without an error", async () => {
  await withFlatpakFixture([], async (executable) => {
    const backend = new FlatpakBackend("user", executable);
    assert.deepEqual(await backend.searchWithStatus("vlc"), { items: [] });
    assert.equal(await backend.isAvailable(), false);
  });
});

test("installed state is keyed by scope and prefers the installed scope", async () => {
  await withFlatpakFixture([
    "  remotes:*) printf 'flathub\\n' ;;",
    "  list:--system) printf 'org.videolan.VLC\\tstable\\tflathub\\tsystem\\norg.example.Other\\tstable\\tflathub\\tsystem\\n' ;;",
    "  search:*)",
    "    printf 'VLC\\tMedia player\\torg.videolan.VLC\\t3.0\\tstable\\tflathub\\n'",
    "    [ \"$2\" = --user ] && printf 'Other\\tOther app\\torg.example.Other\\t1\\tstable\\tflathub\\n'",
    "    exit 0 ;;",
  ], async (executable) => {
    const { items } = await new FlatpakBackend("user", executable)
      .searchWithStatus("vlc");
    const vlc = items.find((item) => item.id === "org.videolan.VLC");
    const other = items.find((item) => item.id === "org.example.Other");
    assert.equal(items.length, 2);
    assert.equal(vlc?.flatpak?.scope, "system");
    assert.equal(vlc?.installed, true);
    // Installed in system, but only offered in user scope: not installed there.
    assert.equal(other?.flatpak?.scope, "user");
    assert.equal(other?.installed, false);
  });
});

test("shows the partial-scope warning even with zero results", async () => {
  await withFlatpakFixture([
    "  remotes:*) printf 'flathub\\n' ;;",
    "  search:--system) printf 'boom\\n' >&2; exit 1 ;;",
  ], async (executable) => {
    const result = await new FlatpakBackend("user", executable)
      .searchWithStatus("vlc");
    assert.deepEqual(result.items, []);
    assert.match(result.warning ?? "", /system search failed/i);
  });
});

test("caches complete searches without spawning processes, never partial ones", async () => {
  await withFlatpakFixture([
    "  remotes:--user) printf 'flathub\\n' ;;",
    "  search:--user) printf 'VLC\\tMedia player\\torg.videolan.VLC\\t3.0\\tstable\\tflathub\\n' ;;",
  ], async (executable, readLog) => {
    const backend = new FlatpakBackend("user", executable);
    await backend.searchWithStatus("vlc");
    const callsAfterFirst = (await readLog()).length;
    assert.equal((await backend.searchWithStatus("VLC")).items.length, 1);
    assert.equal((await readLog()).length, callsAfterFirst);
  });

  await withFlatpakFixture([
    "  remotes:*) printf 'flathub\\n' ;;",
    "  search:--user) printf 'VLC\\tMedia player\\torg.videolan.VLC\\t3.0\\tstable\\tflathub\\n' ;;",
    "  search:--system) exit 1 ;;",
  ], async (executable, readLog) => {
    const backend = new FlatpakBackend("user", executable);
    await backend.searchWithStatus("vlc");
    await backend.searchWithStatus("vlc");
    const searches = (await readLog()).filter((call) => call.startsWith("search --user"));
    assert.equal(searches.length, 2);
  });
});

test("installMany reports apps Flatpak did not install without throwing", async () => {
  await withFlatpakFixture([
    "  remotes:--user) printf 'flathub\\n' ;;",
    "  list:--system) printf 'org.example.Kept\\tstable\\tflathub\\tsystem\\n' ;;",
  ], async (executable, readLog) => {
    const backend = new FlatpakBackend("user", executable);
    const app = (id: string, scope: "user" | "system") => ({
      id,
      name: id,
      description: "",
      source: "flatpak" as const,
      installed: false,
      flatpak: { remote: "flathub", scope },
    });

    const outcome = await backend.installMany([
      app("org.example.Missing", "user"),
      app("org.example.Kept", "user"),
      app("org.example.Kept", "system"),
    ]);
    assert.deepEqual(outcome, {
      installedIds: [],
      alreadyInstalledIds: ["org.example.Kept"],
      missingIds: ["org.example.Missing"],
    });
    const installs = (await readLog()).filter((call) => call.startsWith("install"));
    assert.equal(installs.length, 1);
    assert.doesNotMatch(installs[0] ?? "", /Kept/);
    await assert.rejects(
      backend.install(app("org.example.Missing", "user")),
      /not installed/,
    );
  });
});

test("installMany keeps earlier groups when a later group fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depot-flatpak-partial-"));
  const marker = join(directory, "user-installed");
  try {
    await withFlatpakFixture([
      "  remotes:--user) printf 'flathub\\n' ;;",
      "  remotes:--system) printf 'flathub\\n' ;;",
      `  list:--user) if [ -f '${marker}' ]; then printf 'org.example.User\\tstable\\tflathub\\tuser\\n'; fi ;;`,
      `  install:--user) touch '${marker}' ;;`,
      "  install:--system) echo 'error: Unable to connect' >&2; exit 1 ;;",
    ], async (executable) => {
      const backend = new FlatpakBackend("user", executable);
      const app = (id: string, scope: "user" | "system") => ({
        id,
        name: id,
        description: "",
        source: "flatpak" as const,
        installed: false,
        flatpak: { remote: "flathub", scope },
      });

      const outcome = await backend.installMany([
        app("org.example.User", "user"),
        app("org.example.System", "system"),
      ]);
      assert.deepEqual(outcome.installedIds, ["org.example.User"]);
      assert.deepEqual(outcome.missingIds, ["org.example.System"]);
      assert.ok(outcome.failure instanceof Error);

      // With nothing installed, the group failure is thrown as before.
      await assert.rejects(
        backend.installMany([app("org.example.System", "system")]),
      );
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
