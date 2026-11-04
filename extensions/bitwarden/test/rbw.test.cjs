const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

// Exercise runRbw with simulated GUI environment and Vicinae preferences.
// The fixture rbw launches a sibling rbw-agent by name, like the real executable.
const source = ts.transpileModule(
  readFileSync(join(__dirname, "../src/rbw.ts"), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText;

function loadRbw(rbwPath, env) {
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    process: { env },
    require(name) {
      if (name === "@vicinae/api") {
        return { getPreferenceValues: () => ({ rbwPath }) };
      }
      if (name === "node:child_process") {
        // A real child inherits the caller's environment; use the simulated
        // GUI environment unless runRbw explicitly supplies one.
        function execFile(file, args, options, callback) {
          return require(name).execFile(file, args, { env, ...options }, callback);
        }
        const { promisify } = require("node:util");
        execFile[promisify.custom] = (file, args, options) =>
          promisify(require(name).execFile)(file, args, { env, ...options });
        return { execFile };
      }
      return require(name);
    },
  });
  return exports;
}

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "rbw path "));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "rbw"), '#!/bin/sh\nexec rbw-agent "$@"\n', { mode: 0o755 });
  writeFileSync(
    join(dir, "rbw-agent"),
    '#!/bin/sh\nprintf "%s\\n" "$1" "$TEST_MARKER"\n',
    { mode: 0o755 },
  );
  return dir;
}

const guiPath = "/usr/bin:/bin:/usr/sbin:/sbin";

test("absolute rbw path finds its sibling agent with a macOS GUI PATH", async (t) => {
  const dir = fixture(t);
  const env = { PATH: guiPath, TEST_MARKER: "preserved" };
  const { runRbw } = loadRbw(join(dir, "rbw"), env);
  assert.equal(await runRbw(["unlock"]), "unlock\npreserved\n");
  assert.equal(env.PATH, guiPath, "do not mutate the extension runtime environment");
});

test("bare rbw command retains the existing PATH", async (t) => {
  const dir = fixture(t);
  const { runRbw } = loadRbw("rbw", { PATH: `${dir}:${guiPath}`, TEST_MARKER: "bare" });
  assert.equal(await runRbw(["unlock"]), "unlock\nbare\n");
});

test("absolute rbw path finds its agent even when PATH is unset", async (t) => {
  const dir = fixture(t);
  const { runRbw } = loadRbw(join(dir, "rbw"), { TEST_MARKER: "no-path" });
  assert.equal(await runRbw(["unlock"]), "unlock\nno-path\n");
});

test("missing rbw still reports the installation error", async (t) => {
  const dir = fixture(t);
  const { runRbw, RbwNotInstalledError } = loadRbw(join(dir, "missing"), { PATH: guiPath });
  await assert.rejects(runRbw(["unlock"]), RbwNotInstalledError);
});
