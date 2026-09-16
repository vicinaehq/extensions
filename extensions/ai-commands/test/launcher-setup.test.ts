import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  appWrapper,
  serverWrapper,
  readSettings,
  setSetting,
  supportedOriginalLauncher,
} from "../scripts/launcher-support";
import {
  launcherEnabled,
  privateLauncherDirectory,
  withoutPrivateLauncher,
} from "../src/core/launcher-paths";

test("setup refuses shell wrappers whose behavior could change when backed up elsewhere", () => {
  assert.ok(
    supportedOriginalLauncher(
      '#!/bin/bash\nexec "$HOME/.local/opt/vicinae/app/AppRun" "$@"\n',
    ),
  );
  assert.ok(
    supportedOriginalLauncher('#!/bin/sh\nexec /usr/bin/vicinae "$@"\n'),
  );
  assert.equal(
    supportedOriginalLauncher(
      '#!/bin/sh\nexec "$(dirname "$0")/AppRun" "$@"\n',
    ),
    false,
  );
  assert.equal(
    supportedOriginalLauncher(
      '#!/bin/sh\nexport CUSTOM=yes\nexec /usr/bin/vicinae "$@"\n',
    ),
    false,
  );
  assert.equal(
    supportedOriginalLauncher('#!/bin/sh\nexec /bin/echo|cat "$@"\n'),
    false,
  );
});

test("setup edits nested preferences without discarding comments or unrelated settings", () => {
  const fixtures = [
    '{ // Keep this comment\n "theme": {"name":"custom"},\n}',
    '{"theme":{"name":"custom"},"providers":{"applications":{"preferences":{"other":42}}}}',
    '{"theme":{"name":"custom"},"providers":{"applications":{"preferences":{"launchPrefix":"old", "other":42}}}}',
  ];
  for (const text of fixtures) {
    const next = setSetting(
      text,
      ["providers", "applications", "preferences", "launchPrefix"],
      '"/test/app wrapper"',
    );
    assert.equal(
      readSettings(next).providers.applications.preferences.launchPrefix,
      '"/test/app wrapper"',
    );
    assert.deepEqual(readSettings(next).theme, readSettings(text).theme);
    if (text.includes("// Keep"))
      assert.ok(next.includes("// Keep this comment"));
    if (text.includes('"other"'))
      assert.equal(
        readSettings(next).providers.applications.preferences.other,
        42,
      );
    assert.equal(
      setSetting(
        next,
        ["providers", "applications", "preferences", "launchPrefix"],
        '"/test/app wrapper"',
      ),
      next,
    );
  }
});

test("server wrapper adds private data only for server starts; app wrapper removes it and preserves argv", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ai-wrapper-"));
  const privateData = join(dir, "data with ' quotes $ and spaces");
  const capture = join(dir, "capture");
  const server = join(dir, "server");
  const app = join(dir, "app");
  try {
    await writeFile(
      capture,
      `#!${process.execPath}\nprocess.stdout.write(JSON.stringify({dirs:process.env.XDG_DATA_DIRS,args:process.argv.slice(2)}));\n`,
      { mode: 0o700 },
    );
    await writeFile(server, serverWrapper(capture, privateData));
    await writeFile(app, appWrapper(privateData, []));
    const env = { ...process.env, XDG_DATA_DIRS: "/custom/share:/usr/share" };
    const run = (file: string, args: string[], extra = env) =>
      JSON.parse(
        execFileSync("/bin/sh", [file, ...args], {
          env: extra,
          encoding: "utf8",
        }),
      );
    const daemon = run(server, ["server", "--replace"]);
    assert.equal(daemon.dirs, `${privateData}:/custom/share:/usr/share`);
    assert.equal(run(server, ["open"]).dirs, env.XDG_DATA_DIRS);
    assert.equal(
      run(server, ["server"], { ...env, XDG_DATA_DIRS: daemon.dirs }).dirs,
      daemon.dirs,
    );
    const args = ["$(touch /should-not-exist)", "; bad", '"quoted"', "a b"];
    const launched = run(app, [capture, ...args], {
      ...env,
      XDG_DATA_DIRS: daemon.dirs,
    });
    assert.equal(launched.dirs, env.XDG_DATA_DIRS);
    assert.deepEqual(launched.args, args);
    // An existing UWSM-style prefix also executes with the cleaned environment.
    await writeFile(app, appWrapper(privateData, [capture, "prefix argument"]));
    assert.deepEqual(run(app, args, { ...env, XDG_DATA_DIRS: daemon.dirs }), {
      dirs: env.XDG_DATA_DIRS,
      args: ["prefix argument", ...args],
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("harness children lose the private directory while normal XDG search paths remain", () => {
  const base = { XDG_DATA_HOME: "/test/data" };
  const privateData = privateLauncherDirectory(base);
  const env = {
    ...base,
    XDG_DATA_DIRS: `${privateData}:/one:${privateData}/:/two`,
  };
  assert.equal(launcherEnabled(env), true);
  assert.equal(withoutPrivateLauncher(env).XDG_DATA_DIRS, "/one:/two");
  assert.equal(launcherEnabled(withoutPrivateLauncher(env)), false);
  assert.equal(
    withoutPrivateLauncher({ ...base, XDG_DATA_DIRS: privateData })
      .XDG_DATA_DIRS,
    "/usr/local/share:/usr/share",
  );
  assert.equal(withoutPrivateLauncher(base).XDG_DATA_DIRS, undefined);
});
