import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parseSearch, parseInfo, parseUpdates, pacmanPlan } from "../src/lib/pacman";
import {
  assertPackage,
  assertRepo,
  assertRef,
  literalRegex,
  collect,
  run,
} from "../src/lib/system";
import {
  parseFlatpakList,
  flatpakPlan,
  addFlatpakSource,
  flatpakUpdates,
} from "../src/lib/flatpak";
import { parseDevices } from "../src/lib/firmware";
import { startJob, listJobs, readLog } from "../src/lib/jobs";
import type { Software, Plan } from "../src/lib/types";

const fixture = `cachyos-extra-v4/firefox 159.0-1.1 [installed]\n    Optimized browser\nextra/firefox 159.0-1\n    Generic browser\nextra/foo 1:2.0-3 [installed: 1:1.0-1]\n    A package\n    continued description\n`;
test("repository order wins over duplicate package names and tracks installed versions", () => {
  const items = parseSearch(fixture);
  assert.equal(items.length, 2);
  assert.equal(items[0].source, "cachyos-extra-v4");
  assert.equal(items[0].summary, "Optimized browser");
  assert.equal(items[0].installedVersion, "159.0-1.1");
  assert.equal(items[1].installedVersion, "1:1.0-1");
  assert.equal(items[1].summary, "A package continued description");
});
test("multiline dependencies and epoch versions survive parsing", () => {
  assert.deepEqual(
    parseInfo(
      "Name            : foo\nOptional Deps   : one: a\n                  two: b\nURL             : https://example.org\n",
    ),
    { Name: "foo", "Optional Deps": "one: a\ntwo: b", URL: "https://example.org" },
  );
  const update = parseUpdates("foo 1:1.0-1 -> 2:1.0-2 [ignored]\nwarning: data\n")[0];
  assert.equal(update.installedVersion, "1:1.0-1");
  assert.equal(update.version, "2:1.0-2");
});
test("package identifiers cannot inject options, repository selectors or shell commands", () => {
  for (const invalid of ["--root=/", "a/b", "foo;id", "foo\nbar", "$(id)", "`id`", "-Syu"])
    assert.throws(() => assertPackage(invalid));
  assert.equal(assertPackage("lib32-libfoo++"), "lib32-libfoo++");
  assert.throws(() => assertRepo("../extra"));
  assert.throws(() => assertRef("--delete-data"));
  assert.equal(
    assertRef("app/org.mozilla.firefox/x86_64/stable"),
    "app/org.mozilla.firefox/x86_64/stable",
  );
  assert.equal(new RegExp(literalRegex("foo.*[a]+$")).test("foo.*[a]+$"), true);
  assert.equal(new RegExp(literalRegex("foo.*")).test("foobar"), false);
});
test("a failed backend is visible while working backends retain their results", async () => {
  const result = await collect([
    { label: "good", run: async () => [1, 2] },
    {
      label: "broken",
      run: async () => {
        throw new Error("offline");
      },
    },
  ]);
  assert.deepEqual(result, { items: [1, 2], warnings: ["broken: offline"] });
});
test("Flatpak identity includes scope, origin, kind, architecture and branch", () => {
  const text = "Firefox\tBrowser\torg.mozilla.firefox/x86_64/stable\t159\tflathub\n";
  const user = parseFlatpakList(text, "user")[0],
    system = parseFlatpakList(text, "system")[0];
  assert.notEqual(user.id, system.id);
  assert.equal(user.ref, "app/org.mozilla.firefox/x86_64/stable");
  const runtime = parseFlatpakList(
    "Platform\tRuntime\torg.kde.Platform/x86_64/6.10\t\tflathub\n",
    "user",
    true,
    "runtime",
  )[0];
  assert.equal(runtime.ref, "runtime/org.kde.Platform/x86_64/6.10");
  assert.deepEqual(flatpakPlan(user, "remove").commands[0].args, [
    "--user",
    "uninstall",
    "--noninteractive",
    "--assumeyes",
    user.ref,
  ]);
  assert.equal(flatpakPlan(user, "remove").commands[0].args.includes("--delete-data"), false);
  assert.throws(() => addFlatpakSource("flathub", "http://example.org/a.flatpakrepo", "user"));
  assert.throws(() => addFlatpakSource("--bad", "https://example.org/a.flatpakrepo", "user"));
});
test("firmware device status and update releases remain distinct", () => {
  const data = JSON.stringify({
    Devices: [
      {
        DeviceId: "a".repeat(40),
        Name: "UEFI",
        Version: "1",
        Releases: [{ Version: "2" }],
        Flags: ["needs-reboot"],
      },
      { DeviceId: "b".repeat(40), Name: "CPU", Version: "3" },
    ],
  });
  assert.equal(parseDevices(data).length, 2);
  assert.equal(parseDevices(data, true).length, 1);
  assert.equal(parseDevices(data, true)[0].installedVersion, "1");
  assert.equal(parseDevices(data, true)[0].version, "2");
});

async function fakeCommand(name: string, body: string, task: (directory: string) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), "discover-fixture-"));
  const previous = process.env.PATH;
  process.env.PATH = directory + ":" + previous;
  writeFileSync(join(directory, name), `#!${process.execPath}\n${body}`, { mode: 0o755 });
  try {
    await task(directory);
  } finally {
    process.env.PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  }
}
test("system install combines database refresh with a full upgrade; removals need no repo", async () => {
  await fakeCommand("pacman", "process.stdout.write('foo 2.0\\n');", async () => {
    const pkg: Software = {
      id: "pacman:foo",
      backend: "pacman",
      name: "foo",
      title: "foo",
      version: "2",
      source: "cachyos-extra-v4",
      summary: "",
      installed: false,
    };
    const install = await pacmanPlan(pkg, "install");
    assert.deepEqual(install.commands[0].args, [
      "/usr/bin/pacman",
      "-Syu",
      "--needed",
      "--noconfirm",
      "--",
      "cachyos-extra-v4/foo",
    ]);
    const remove = await pacmanPlan(
      { ...pkg, installed: true, source: "Installed package" },
      "remove",
    );
    assert.deepEqual(remove.commands[0].args, [
      "/usr/bin/pacman",
      "-R",
      "--noconfirm",
      "--",
      "foo",
    ]);
    assert.match(install.description, /FULL system upgrade/);
  });
});
test("Flatpak updates query apps and runtimes without confusing the ref type", async () => {
  await fakeCommand(
    "flatpak",
    `const runtime=process.argv.includes('--runtime');process.stdout.write(runtime ? 'Platform\\tRuntime\\torg.kde.Platform/x86_64/6.10\\t\\tflathub\\n' : 'Firefox\\tBrowser\\torg.mozilla.firefox/x86_64/stable\\t159\\tflathub\\n');`,
    async () => {
      const results = await flatpakUpdates("user");
      assert.equal(results.length, 2);
      assert.equal(results[1].ref, "runtime/org.kde.Platform/x86_64/6.10");
    },
  );
});
test("process arguments are passed literally without a shell", async () => {
  const hostile = "$(echo leaked); `id` ' spaced";
  await fakeCommand(
    "echo-args",
    "process.stdout.write(JSON.stringify(process.argv.slice(2)));",
    async () => {
      assert.deepEqual(JSON.parse(await run("echo-args", [hostile])), [hostile]);
    },
  );
});
test("an accepted no-results exit code does not hide a backend error", async () => {
  await fakeCommand(
    "backend-error",
    "process.stderr.write('repository unavailable');process.exit(1);",
    async () => {
      await assert.rejects(run("backend-error", [], { codes: [1] }), /repository unavailable/);
    },
  );
});
const assets = resolve("assets");
test("interactive jobs use Vicinae's terminal launcher and preserve launch errors", async () => {
  const root = mkdtempSync(join(tmpdir(), "discover-terminal-"));
  try {
    const plan: Plan = {
      title: "Interactive launch test",
      description: "",
      backend: "aur",
      preview: [],
      commands: [{ file: process.execPath, args: ["--version"], terminal: true }],
    };
    let invocation: string[] = [];
    const job = await startJob(plan, root, assets, async (args) => {
      invocation = args;
    });
    assert.equal(invocation[1], join(assets, "runner.py"));
    assert.equal(invocation[2], join(root, job.id));
    assert.equal(listJobs(root).find((j) => j.id === job.id)?.status, "queued");
    await assert.rejects(
      startJob(plan, root, assets, async () => {
        throw new Error("No default terminal configured");
      }),
      /No default terminal configured/,
    );
    assert.equal(listJobs(root).filter((j) => j.status === "failed").length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
async function waitDone(root: string, id: string) {
  for (let i = 0; i < 150; i++) {
    const job = listJobs(root).find((j) => j.id === id);
    if (job && ["success", "failed"].includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("Runner did not finish");
}
test("detached runner persists success and logs; failures never become success", async () => {
  const root = mkdtempSync(join(tmpdir(), "discover-jobs-"));
  try {
    const plan: Plan = {
      title: "Read-only runner test",
      description: "",
      backend: "pacman",
      preview: [],
      commands: [{ file: process.execPath, args: ["-e", "console.log('detached-ok')"] }],
    };
    const job = await startJob(plan, root, assets);
    assert.equal((await waitDone(root, job.id)).status, "success");
    assert.match(readLog(root, job.id), /detached-ok/);
    const failure = await startJob(
      { ...plan, commands: [{ file: process.execPath, args: ["-e", "process.exit(7)"] }] },
      root,
      assets,
    );
    const failed = await waitDone(root, failure.id);
    assert.equal(failed.status, "failed");
    assert.equal(failed.exitCode, 7);
    const noOp = await startJob(
      {
        ...plan,
        commands: [{ file: process.execPath, args: ["-e", "process.exit(2)"], acceptedCodes: [2] }],
      },
      root,
      assets,
    );
    assert.equal((await waitDone(root, noOp.id)).status, "success");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("runner refuses an overlapping transaction instead of running both", async () => {
  const root = mkdtempSync(join(tmpdir(), "discover-lock-"));
  try {
    const slow: Plan = {
      title: "Lock test",
      description: "",
      backend: "pacman",
      preview: [],
      commands: [
        { file: process.execPath, args: ["-e", "setTimeout(()=>console.log('first'),600)"] },
      ],
    };
    const first = await startJob(slow, root, assets);
    for (let i = 0; i < 50 && listJobs(root)[0]?.status !== "running"; i++)
      await new Promise((r) => setTimeout(r, 10));
    const second = await startJob(
      {
        ...slow,
        commands: [{ file: process.execPath, args: ["-e", "console.log('should-not-run')"] }],
      },
      root,
      assets,
    );
    const rejected = await waitDone(root, second.id);
    assert.equal(rejected.status, "failed");
    assert.match(rejected.error || "", /Another package transaction/);
    assert.doesNotMatch(readLog(root, second.id), /should-not-run/);
    assert.equal((await waitDone(root, first.id)).status, "success");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("extension-owned UI and command labels use English defaults", () => {
  function walk(path: string): string[] {
    return readdirSync(path, { withFileTypes: true }).flatMap((p) =>
      p.isDirectory() ? walk(join(path, p.name)) : [join(path, p.name)],
    );
  }
  const paths = [
    "package.json",
    ...walk("src"),
    ...walk("assets").filter((p) => p.endsWith(".py")),
  ];
  for (const path of paths) {
    const text = readFileSync(path, "utf8");
    assert.doesNotMatch(text, /[çğıöşüÇĞİÖŞÜ]/, path);
    assert.doesNotMatch(text, /Up to datelemeler|tr-TR|Name\[tr\]/, path);
  }
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(
    manifest.commands.find((c: { name: string }) => c.name === "updates").title,
    "Updates",
  );
});
