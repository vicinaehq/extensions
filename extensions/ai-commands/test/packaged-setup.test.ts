import { once } from "node:events";
import assert from "node:assert/strict";
import type { PathLike } from "node:fs";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  configureLauncher,
  inspectLauncherSetup,
} from "../src/core/launcher-setup";
import { packagedService, serviceDropIn } from "../src/core/launcher-service";
import { restartLauncher } from "../src/core/launcher-restart";

const show =
  "ActiveState=active\nExecStart={ path=/usr/bin/vicinae ; argv[]=/usr/bin/vicinae server --replace ; ignore_errors=no ; }\nEnvironmentFiles=\nUnsetEnvironment=\n";
async function fixture() {
  const home = await fs.mkdtemp(join(tmpdir(), "ai-packaged-"));
  const config = join(home, "config");
  const settings = join(config, "vicinae/settings.json");
  await fs.mkdir(join(config, "vicinae"), { recursive: true });
  const original = '{ // keep\n"theme":{"name":"mine"}}\n';
  await fs.writeFile(settings, original);
  const calls: string[][] = [];
  const options = {
    home,
    env: {
      XDG_CONFIG_HOME: config,
      XDG_DATA_HOME: join(home, "data"),
      XDG_DATA_DIRS: "/custom/share:/usr/share",
      PATH: "/no-fixture-executables",
    },
    serviceRunner: async (args: string[]) => {
      calls.push(args);
      return args.includes("show") ? show : "";
    },
  };
  const dropIn = join(
    config,
    "systemd/user/vicinae.service.d/90-ai-commands.conf",
  );
  return {
    home,
    settings,
    original,
    options,
    calls,
    dropIn,
    cleanup: () => fs.rm(home, { recursive: true, force: true }),
  };
}

test("packaged service: read-only preview, explicit enable, preserved search paths, restart and repeat", async () => {
  const f = await fixture();
  try {
    const preview = await inspectLauncherSetup(f.options);
    assert.equal(preview.mode, "service");
    assert.equal(preview.status, "available");
    await assert.rejects(fs.access(f.dropIn), { code: "ENOENT" });
    const enabled = await configureLauncher(f.options);
    assert.equal(enabled.status, "restart");
    assert.equal(enabled.launcher, "/usr/bin/vicinae");
    const contents = await fs.readFile(f.dropIn, "utf8");
    assert.ok(
      contents.includes(`${enabled.dataRoot}:/custom/share:/usr/share`),
    );
    assert.ok(!contents.includes("ExecStart"));
    await assert.rejects(fs.access(join(f.home, ".local/bin/vicinae")), {
      code: "ENOENT",
    });
    assert.ok((await fs.readFile(f.settings, "utf8")).includes("// keep"));
    assert.equal(f.calls.filter((a) => a.includes("daemon-reload")).length, 1);
    await restartLauncher(enabled.launcher, f.options.serviceRunner);
    assert.deepEqual(f.calls.at(-1), [
      "--user",
      "--no-block",
      "restart",
      "vicinae.service",
    ]);
    const running = {
      ...f.options,
      env: {
        ...f.options.env,
        XDG_DATA_DIRS: `${enabled.dataRoot}:/custom/share:/usr/share`,
      },
    };
    assert.equal((await inspectLauncherSetup(running)).status, "enabled");
    await configureLauncher(running);
    assert.equal(await fs.readFile(f.dropIn, "utf8"), contents);
    assert.equal(f.calls.filter((a) => a.includes("daemon-reload")).length, 1);
  } finally {
    await f.cleanup();
  }
});

for (const kind of ["write", "reload", "completed-record"] as const) {
  test(`packaged ${kind} failure restores settings and absent drop-in; pending setup resumes`, async () => {
    const f = await fixture();
    let failed = false;
    try {
      const options = {
        ...f.options,
        serviceRunner: async (args: string[]) => {
          if (kind === "reload" && args.includes("daemon-reload") && !failed) {
            failed = true;
            throw Error("reload failed");
          }
          return f.options.serviceRunner(args);
        },
      };
      const io = {
        ...fs,
        link: async (from: PathLike, to: PathLike) => {
          if (kind === "write" && String(to) === f.dropIn && !failed) {
            failed = true;
            throw Error("write failed");
          }
          return fs.link(from, to);
        },
        rename: async (from: PathLike, to: PathLike) => {
          if (
            kind === "completed-record" &&
            String(to).endsWith("setup.json") &&
            !failed
          ) {
            failed = true;
            throw Error("record failed");
          }
          return fs.rename(from, to);
        },
      };
      await assert.rejects(configureLauncher(options, io), /failed/);
      assert.equal(await fs.readFile(f.settings, "utf8"), f.original);
      await assert.rejects(fs.access(f.dropIn), { code: "ENOENT" });
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

test("packaged setup preserves unknown drop-ins, changed managed files, linked directories and custom app prefixes", async () => {
  for (const kind of ["unknown", "changed", "linked", "prefix"]) {
    const f = await fixture();
    try {
      if (kind === "changed") await configureLauncher(f.options);
      if (kind === "unknown" || kind === "changed") {
        await fs.mkdir(join(f.dropIn, ".."), { recursive: true });
        await fs.writeFile(f.dropIn, "# user settings\n");
      } else if (kind === "linked") {
        await fs.mkdir(join(f.home, "other"));
        await fs.symlink(join(f.home, "other"), join(f.home, "config/systemd"));
      } else
        await fs.writeFile(
          f.settings,
          '{"providers":{"applications":{"preferences":{"launchPrefix":"custom"}}}}',
        );
      await assert.rejects(configureLauncher(f.options));
      if (kind === "unknown" || kind === "changed")
        assert.equal(await fs.readFile(f.dropIn, "utf8"), "# user settings\n");
      assert.equal(f.calls.filter((a) => a.includes("restart")).length, 0);
    } finally {
      await f.cleanup();
    }
  }
});

test("service discovery rejects inactive, missing, custom arguments, multiple commands and environment overrides", async () => {
  for (const output of [
    "",
    show.replace("active\n", "inactive\n"),
    show.replace("server --replace", "server --config /custom"),
    show.replaceAll("/usr/bin/vicinae", "/custom/vicinae"),
    show.replace("EnvironmentFiles=", "EnvironmentFiles=/custom/env"),
    show.replace("UnsetEnvironment=", "UnsetEnvironment=XDG_DATA_DIRS"),
    show + "{ path=/bin/other ; }",
  ]) {
    await assert.rejects(packagedService(async () => output));
  }
  await assert.rejects(
    packagedService(async () => {
      throw Error("no bus");
    }),
    /user service/,
  );
});

test("drop-in escapes systemd specifiers and quotes without shell expansion", () => {
  assert.equal(
    serviceDropIn('/home/a%name/"data"\\x:$HOME'),
    '# Vicinae AI Commands managed service environment v1\n[Service]\nEnvironment="XDG_DATA_DIRS=/home/a%%name/\\"data\\"\\\\x:$HOME"\n',
  );
});

for (const stage of [
  "pending",
  "original",
  "settings",
  "service-drop-in",
  "complete",
]) {
  test(`packaged host termination after ${stage} resumes safely`, async () => {
    const f = await fixture();
    try {
      const { spawn } = await import("node:child_process");
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          join(__dirname, "fixtures/setup-killed.ts"),
          JSON.stringify(f.options),
          stage,
          "service",
        ],
        { stdio: "pipe" },
      );
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      const [code, signal] = await once(child, "close");
      assert.equal(signal, "SIGKILL", `${code}: ${stderr}`);
      assert.equal(
        (await inspectLauncherSetup(f.options)).status,
        stage === "complete" ? "restart" : "incomplete",
      );
      assert.equal((await configureLauncher(f.options)).status, "restart");
      assert.ok(
        (await fs.readFile(f.dropIn, "utf8")).includes("XDG_DATA_DIRS="),
      );
    } finally {
      await f.cleanup();
    }
  });
}

for (const executable of ["vicinae", "/usr/local/bin/vicinae"]) {
  test(`packaged service supports ${executable} without changing ExecStart`, async () => {
    const f = await fixture();
    try {
      const runner = async (args: string[]) =>
        args.includes("show")
          ? show.replaceAll("/usr/bin/vicinae", executable)
          : "";
      const result = await configureLauncher({
        ...f.options,
        serviceRunner: runner,
      });
      assert.equal(result.launcher, executable);
      await restartLauncher(result.launcher, runner);
      assert.ok(!(await fs.readFile(f.dropIn, "utf8")).includes("ExecStart"));
    } finally {
      await f.cleanup();
    }
  });
}
