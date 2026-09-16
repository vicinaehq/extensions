import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  configureLauncher,
  inspectLauncherSetup,
  type SetupFileSystem,
} from "../src/core/launcher-setup";
import { readSettings } from "../src/core/launcher-support";
import {
  canRestartLauncher,
  restartLauncher,
  serviceUsesLauncher,
} from "../src/core/launcher-restart";

async function fixture() {
  const home = await fs.mkdtemp(join(tmpdir(), "ai-setup-flow-"));
  const launcher = join(home, ".local/bin/vicinae");
  const configHome = join(home, "config");
  const dataHome = join(home, "data");
  const settings = join(configHome, "vicinae/settings.json");
  const original = '#!/bin/sh\nexec /usr/bin/vicinae "$@"\n';
  const config = '{ // preserve me\n "theme":{"name":"mine"},\n}\n';
  const options = {
    home,
    env: {
      XDG_CONFIG_HOME: configHome,
      XDG_DATA_HOME: dataHome,
      XDG_DATA_DIRS: "/usr/share",
      PATH: "/no-fixture-executables",
    },
  };
  await fs.mkdir(join(home, ".local/bin"), { recursive: true });
  await fs.mkdir(join(configHome, "vicinae"), { recursive: true });
  await fs.writeFile(launcher, original, { mode: 0o755 });
  await fs.writeFile(settings, config);
  return {
    home,
    launcher,
    settings,
    original,
    config,
    options,
    cleanup: () => fs.rm(home, { recursive: true, force: true }),
  };
}

test("first setup preserves originals and settings; repeat is read-only and restart changes the status", async () => {
  const f = await fixture();
  try {
    const before = await inspectLauncherSetup(f.options);
    assert.equal(before.status, "available");
    await assert.rejects(fs.access(before.backupDirectory), { code: "ENOENT" });
    const result = await configureLauncher(f.options);
    assert.equal(result.status, "restart");
    assert.equal(
      await fs.readFile(
        join(result.backupDirectory, "vicinae-original"),
        "utf8",
      ),
      f.original,
    );
    const stored = JSON.parse(
      await fs.readFile(join(result.backupDirectory, "setup.json"), "utf8"),
    );
    assert.equal(await fs.readFile(stored.settingsBackup, "utf8"), f.config);
    const settings = await fs.readFile(f.settings, "utf8");
    assert.ok(settings.includes("// preserve me"));
    assert.deepEqual(readSettings(settings).theme, { name: "mine" });
    assert.ok(
      readSettings(
        settings,
      ).providers.applications.preferences.launchPrefix.includes("launch-app"),
    );
    assert.equal((await fs.stat(f.launcher)).mode & 0o777, 0o755);
    const readOnly = {
      ...fs,
      writeFile: async () => {
        throw new Error("Unexpected write on repeat");
      },
    } as SetupFileSystem;
    assert.deepEqual(await configureLauncher(f.options, readOnly), result);
    assert.equal(
      (
        await inspectLauncherSetup({
          ...f.options,
          env: {
            ...f.options.env,
            XDG_DATA_DIRS: result.dataRoot + ":/usr/share",
          },
        })
      ).status,
      "enabled",
    );
  } finally {
    await f.cleanup();
  }
});

for (const stage of ["launch-app", "settings.json", "vicinae", "setup.json"]) {
  test(`a failed ${stage} write restores the previous setup and allows retry`, async () => {
    const f = await fixture();
    try {
      let failed = false;
      const io = {
        ...fs,
        rename: async (source, target) => {
          if (!failed && String(target).endsWith("/" + stage)) {
            failed = true;
            throw new Error("Injected write failure");
          }
          return fs.rename(source, target);
        },
      } as SetupFileSystem;
      await assert.rejects(
        configureLauncher(f.options, io),
        /Injected write failure/,
      );
      assert.ok(failed);
      assert.equal(await fs.readFile(f.launcher, "utf8"), f.original);
      assert.equal(await fs.readFile(f.settings, "utf8"), f.config);
      assert.equal(
        (await inspectLauncherSetup(f.options)).status,
        "incomplete",
      );
      assert.equal((await configureLauncher(f.options)).status, "restart");
    } finally {
      await f.cleanup();
    }
  });
}

test("rollback removes newly-created settings when none existed", async () => {
  const f = await fixture();
  try {
    await fs.unlink(f.settings);
    const io = {
      ...fs,
      rename: async (source, target) => {
        if (String(target) === f.launcher)
          throw new Error("Launcher write failure");
        return fs.rename(source, target);
      },
    } as SetupFileSystem;
    await assert.rejects(
      configureLauncher(f.options, io),
      /Launcher write failure/,
    );
    await assert.rejects(fs.access(f.settings), { code: "ENOENT" });
    assert.equal(await fs.readFile(f.launcher, "utf8"), f.original);
  } finally {
    await f.cleanup();
  }
});

for (const failure of [
  "missing",
  "binary",
  "custom",
  "symlink",
  "settings-symlink",
  "prefix",
  "invalid-json",
  "linked-directory",
]) {
  test(`unsupported ${failure} setup does not replace user files`, async () => {
    const f = await fixture();
    try {
      if (failure === "missing") await fs.unlink(f.launcher);
      if (failure === "binary")
        await fs.writeFile(f.launcher, Buffer.alloc(17000));
      if (failure === "custom")
        await fs.writeFile(
          f.launcher,
          '#!/bin/sh\nexport CUSTOM=yes\nexec /usr/bin/vicinae "$@"\n',
        );
      if (failure === "symlink") {
        await fs.unlink(f.launcher);
        await fs.symlink("/usr/bin/true", f.launcher);
      }
      if (failure === "settings-symlink") {
        await fs.rename(f.settings, f.settings + ".original");
        await fs.symlink(f.settings + ".original", f.settings);
      }
      if (failure === "prefix")
        await fs.writeFile(
          f.settings,
          '{"providers":{"applications":{"preferences":{"launchPrefix":"custom-launcher"}}}}',
        );
      if (failure === "invalid-json") await fs.writeFile(f.settings, "{broken");
      if (failure === "linked-directory") {
        await fs.mkdir(join(f.home, "elsewhere"));
        await fs.symlink(join(f.home, "elsewhere"), join(f.home, "data"));
      }
      let writes = 0;
      const io = {
        ...fs,
        writeFile: async () => {
          writes++;
          throw new Error("Unexpected write");
        },
      } as SetupFileSystem;
      await assert.rejects(configureLauncher(f.options, io));
      assert.equal(writes, 0);
    } finally {
      await f.cleanup();
    }
  });
}

test("later launcher changes and damaged backups are preserved and reported", async () => {
  const f = await fixture();
  try {
    const setup = await configureLauncher(f.options);
    const managed = await fs.readFile(f.launcher, "utf8");
    await fs.writeFile(f.launcher, managed + "# user change\n");
    await assert.rejects(configureLauncher(f.options), /changed after setup/);
    assert.equal(
      await fs.readFile(f.launcher, "utf8"),
      managed + "# user change\n",
    );
    await fs.writeFile(f.launcher, managed);
    await fs.writeFile(
      join(setup.backupDirectory, "vicinae-original"),
      "changed backup",
    );
    await assert.rejects(configureLauncher(f.options), /backup changed/);
  } finally {
    await f.cleanup();
  }
});

test("UWSM launch behavior is retained in the application wrapper", async () => {
  const f = await fixture();
  try {
    const bin = join(f.home, "bin");
    await fs.mkdir(bin);
    for (const name of ["uwsm", "uwsm-app"])
      await fs.writeFile(join(bin, name), "#!/bin/sh\nexit 0\n", {
        mode: 0o700,
      });
    const setup = await configureLauncher({
      ...f.options,
      env: { ...f.options.env, PATH: bin },
    });
    const state = JSON.parse(
      await fs.readFile(join(setup.backupDirectory, "setup.json"), "utf8"),
    );
    assert.deepEqual(state.prefix, [join(bin, "uwsm-app"), "--"]);
    assert.ok(
      (
        await fs.readFile(join(setup.backupDirectory, "launch-app"), "utf8")
      ).includes("uwsm-app"),
    );
  } finally {
    await f.cleanup();
  }
});

test("restart is queued only for the matching active user service and rechecks its configuration", async () => {
  const launcher = "/home/test/.local/bin/vicinae";
  const show = `ActiveState=active\nExecStart={ path=${launcher} ; argv[]=${launcher} server --replace ; ignore_errors=no ; }\n`;
  assert.equal(serviceUsesLauncher(show, launcher), true);
  assert.equal(
    serviceUsesLauncher(show.replace("active\n", "inactive\n"), launcher),
    false,
  );
  assert.equal(serviceUsesLauncher(show, "/different/launcher"), false);
  const calls: string[][] = [];
  const run = async (args: string[]) => {
    calls.push(args);
    return show;
  };
  assert.equal(await canRestartLauncher(launcher, run), true);
  await restartLauncher(launcher, run);
  assert.deepEqual(calls.at(-1), [
    "--user",
    "--no-block",
    "restart",
    "vicinae.service",
  ]);
  const wrongCalls: string[][] = [];
  await assert.rejects(
    restartLauncher(launcher, async (args) => {
      wrongCalls.push(args);
      return "ActiveState=inactive";
    }),
    /not running/,
  );
  assert.equal(wrongCalls.length, 1);
});

test("linked applications leaf cannot redirect private commands into shared menus", async () => {
  const f = await fixture();
  try {
    const root = join(f.home, "data/vicinae-ai-commands/launcher-data");
    const shared = join(f.home, "shared-apps");
    await fs.mkdir(root, { recursive: true });
    await fs.mkdir(shared);
    await fs.symlink(shared, join(root, "applications"));
    await assert.rejects(configureLauncher(f.options), /ordinary directories/);
    assert.equal(await fs.readFile(f.launcher, "utf8"), f.original);
    assert.deepEqual(await fs.readdir(shared), []);
  } finally {
    await f.cleanup();
  }
});

test("failed settings rollback keeps the executable referenced by launchPrefix and can resume", async () => {
  const f = await fixture();
  try {
    let stateWrites = 0;
    let settingsWrites = 0;
    const io = {
      ...fs,
      rename: async (source, target) => {
        if (String(target).endsWith("/setup.json") && ++stateWrites === 1)
          throw new Error("Commit failed");
        if (String(target) === f.settings && ++settingsWrites === 2)
          throw new Error("Rollback EACCES");
        return fs.rename(source, target);
      },
    } as SetupFileSystem;
    await assert.rejects(
      configureLauncher(f.options, io),
      /could not fully restore/,
    );
    const prefix = readSettings(await fs.readFile(f.settings, "utf8")).providers
      .applications.preferences.launchPrefix;
    await fs.access(prefix.slice(1, -1));
    assert.equal((await inspectLauncherSetup(f.options)).status, "incomplete");
    assert.equal((await configureLauncher(f.options)).status, "restart");
  } finally {
    await f.cleanup();
  }
});

import { spawn } from "node:child_process";
import { once } from "node:events";
for (const stage of [
  "pending",
  "original",
  "settings-backup",
  "original-partial",
  "settings-partial",
  "app",
  "settings",
  "launcher",
  "complete",
]) {
  test(
    `host death after ${stage} is recoverable from the saved setup record`,
    { timeout: 15000 },
    async () => {
      const f = await fixture();
      try {
        const child = spawn(
          process.execPath,
          [
            "--import",
            "tsx",
            join(__dirname, "fixtures/setup-killed.ts"),
            JSON.stringify(f.options),
            stage,
          ],
          { stdio: ["ignore", "ignore", "pipe"] },
        );
        let stderr = "";
        child.stderr.on("data", (chunk) => {
          stderr += chunk;
        });
        const [code, signal] = await once(child, "close");
        assert.equal(
          signal,
          "SIGKILL",
          `Expected fixture death, got ${code}: ${stderr.slice(-1000)}`,
        );
        assert.equal(
          (await inspectLauncherSetup(f.options)).status,
          stage === "complete" ? "restart" : "incomplete",
        );
        const result = await configureLauncher(f.options);
        assert.equal(result.status, "restart");
        assert.equal(
          await fs.readFile(
            join(result.backupDirectory, "vicinae-original"),
            "utf8",
          ),
          f.original,
        );
        const state = JSON.parse(
          await fs.readFile(join(result.backupDirectory, "setup.json"), "utf8"),
        );
        assert.equal(state.pending, false);
        assert.equal(state.settingsContents, undefined);
        assert.equal(await fs.readFile(state.settingsBackup, "utf8"), f.config);
      } finally {
        await f.cleanup();
      }
    },
  );
}

for (const originalBackup of [true, false]) {
  test(`partial ${originalBackup ? "launcher" : "settings"} backup write remains recoverable`, async () => {
    const f = await fixture();
    try {
      let injected = false;
      const io = {
        ...fs,
        writeFile: async (path, data, options) => {
          if (
            !injected &&
            String(data) === (originalBackup ? f.original : f.config)
          ) {
            injected = true;
            await fs.writeFile(path, String(data).slice(0, 3), options);
            throw new Error("Injected ENOSPC");
          }
          return fs.writeFile(path, data, options);
        },
      } as SetupFileSystem;
      await assert.rejects(configureLauncher(f.options, io), /ENOSPC/);
      assert.equal(
        (await inspectLauncherSetup(f.options)).status,
        "incomplete",
      );
      assert.equal((await configureLauncher(f.options)).status, "restart");
    } finally {
      await f.cleanup();
    }
  });
}
