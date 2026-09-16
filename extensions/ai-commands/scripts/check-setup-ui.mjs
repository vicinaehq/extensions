import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as childProcess from "node:child_process";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import React from "react";
import { create, act } from "react-test-renderer";

// Exercise the shipped command and its actions against real temporary files.
// Only Vicinae's UI/storage and OS service calls are replaced.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const output = resolve(process.argv[2] ?? "dist");
const source = await fs.readFile(join(output, "setup-ai-commands.js"), "utf8");
const home = await fs.mkdtemp(join(os.tmpdir(), "ai-setup-ui-"));
const launcher = join(home, ".local/bin/vicinae");
const settings = join(home, "config/vicinae/settings.json");
const dataRoot = join(home, "data/vicinae-ai-commands/launcher-data");
const original = '#!/bin/sh\nexec /usr/bin/vicinae "$@"\n';
const config = '{ // user comment\n"theme":{"name":"mine"}}';
const command = {
  schemaVersion: 1,
  id: "test-command",
  name: "Test translate",
  harness: "claude",
  model: "default",
  effort: "",
  prompt: "Translate {selection}",
  systemPrompt: "",
  createdAt: "now",
  updatedAt: "now",
};
const saved = { "ai-command:v1:test-command": JSON.stringify(command) };
const serviceCalls = [];
let serviceMatches = true;
let failAppWrite = false;
const fakeExec = () => {
  throw new Error("Use async service calls");
};
fakeExec[promisify.custom] = async (executable, args) => {
  if (executable === "uwsm")
    throw Object.assign(new Error("Not installed"), { code: "ENOENT" });
  assert.equal(executable, "systemctl");
  serviceCalls.push(args);
  return {
    stdout: args.includes("show")
      ? `ActiveState=active\nExecStart={ path=${serviceMatches ? launcher : "/other/vicinae"} ; argv[]=${launcher} server --replace ; }\n`
      : "",
    stderr: "",
  };
};
const action = (props) => React.createElement("action", props);
action.OpenInBrowser = (props) => React.createElement("browser-action", props);
const api = {
  Action: action,
  ActionPanel: (props) => React.createElement("actions", props),
  Detail: (props) => React.createElement("detail", props, props.actions),
  Icon: {},
  Toast: { Style: {} },
  showToast: async () => {},
  environment: {
    assetsPath: join(output, "assets"),
    supportPath: join(home, "support/ai-commands"),
    extensionName: "ai-commands",
    ownerOrAuthorName: "test-owner",
  },
  LocalStorage: { allItems: async () => ({ ...saved }) },
};
const fakeProcess = Object.create(process);
fakeProcess.env = {
  ...process.env,
  XDG_DATA_HOME: join(home, "data"),
  XDG_CONFIG_HOME: join(home, "config"),
  XDG_DATA_DIRS: "/usr/share",
};
const loaded = { exports: {} };
new Function(
  "require",
  "module",
  "exports",
  "__dirname",
  "__filename",
  "process",
  source,
)(
  (name) => {
    if (name === "@vicinae/api") return api;
    if (name === "node:fs/promises")
      return {
        ...fs,
        rename: async (source, target) => {
          if (failAppWrite && String(target).endsWith("/launch-app")) {
            failAppWrite = false;
            throw new Error("Injected setup write failure");
          }
          return fs.rename(source, target);
        },
      };
    if (name === "node:os") return { ...os, homedir: () => home };
    if (name === "node:child_process")
      return { ...childProcess, execFile: fakeExec };
    return require(name);
  },
  loaded,
  loaded.exports,
  output,
  join(output, "setup-ai-commands.js"),
  fakeProcess,
);
let view;
const actions = () => view.root.findAllByType("action");
const message = () => view.root.findByType("detail").props.markdown;
async function settled() {
  for (let attempt = 0; attempt < 200; attempt++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    if (actions().some((item) => item.props.title === "Check Again")) return;
  }
  throw new Error("Setup UI did not settle");
}
async function open() {
  await act(async () => {
    view = create(React.createElement(loaded.exports.default));
  });
  await settled();
}
async function click(title) {
  const found = actions().find((item) => item.props.title === title);
  assert.ok(found, `Missing action: ${title}. ${message()}`);
  await act(async () => {
    await found.props.onAction();
  });
  await settled();
}
async function close() {
  if (view) await act(async () => view.unmount());
}
try {
  await fs.mkdir(join(home, ".local/bin"), { recursive: true });
  await fs.mkdir(join(home, "config/vicinae"), { recursive: true });
  await fs.writeFile(launcher, original, { mode: 0o755 });
  await fs.writeFile(settings, config);
  await open();
  assert.match(message(), /Add your commands/);
  assert.equal(await fs.readFile(launcher, "utf8"), original);
  failAppWrite = true;
  await click("Enable Root Search");
  assert.match(message(), /Setup needs attention/);
  assert.equal(await fs.readFile(launcher, "utf8"), original);
  await click("Check Again");
  assert.match(message(), /Setup was interrupted/);
  await click("Resume Setup");
  assert.match(message(), /Restart Vicinae to finish/);
  assert.ok((await fs.readFile(settings, "utf8")).includes("// user comment"));
  const entries = await fs.readdir(join(dataRoot, "applications"));
  assert.equal(entries.length, 1);
  const entry = await fs.readFile(
    join(dataRoot, "applications", entries[0]),
    "utf8",
  );
  assert.match(entry, /Name=Test translate/);
  assert.match(entry, /Name=Edit AI Command/);
  await assert.rejects(fs.access(join(home, "data/applications")), {
    code: "ENOENT",
  });
  assert.equal(saved["ai-command:v1:test-command"], JSON.stringify(command));
  await click("Restart Vicinae");
  assert.deepEqual(serviceCalls.at(-1), [
    "--user",
    "--no-block",
    "restart",
    "vicinae.service",
  ]);
  await close();
  fakeProcess.env.XDG_DATA_DIRS = dataRoot + ":/usr/share";
  await open();
  assert.match(message(), /Root search is enabled/);
  assert.ok(
    !actions().some((item) => item.props.title === "Enable Root Search"),
  );
  await close();
  fakeProcess.env.XDG_DATA_DIRS = "/usr/share";
  await fs.mkdir(join(home, "data/applications"), { recursive: true });
  const conflictingEntry = join(home, "data/applications", entries[0]);
  await fs.writeFile(conflictingEntry, "Unowned entry");
  await open();
  assert.match(message(), /Some command entries need attention/);
  assert.ok(actions().some((item) => item.props.title === "Restart Vicinae"));
  assert.equal(await fs.readFile(conflictingEntry, "utf8"), "Unowned entry");
  await close();
  await fs.unlink(conflictingEntry);
  serviceMatches = false;
  await open();
  assert.match(message(), /Quit and reopen Vicinae/);
  assert.ok(!actions().some((item) => item.props.title === "Restart Vicinae"));
  await close();
  await fs.writeFile(launcher, "#!/bin/sh\n# user changed this\n");
  await open();
  assert.match(message(), /Setup needs attention/);
  assert.ok(
    !actions().some((item) => item.props.title === "Enable Root Search"),
  );
  assert.equal(
    await fs.readFile(launcher, "utf8"),
    "#!/bin/sh\n# user changed this\n",
  );
  console.log(
    "Packaged setup UI passed: enable, failed write, resume, private entries, restart, already enabled, unsupported service, and changed configuration.",
  );
} finally {
  await close();
  await fs.rm(home, { recursive: true, force: true });
}
