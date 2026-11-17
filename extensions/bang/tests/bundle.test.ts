import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { runInNewContext } from "node:vm";

test("official production bundle loads in isolation without dependency-relative requires", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "bang-bundle-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const require = createRequire(import.meta.url);
  const cli = path.join(path.dirname(require.resolve("@vicinae/api")), "bin.js");
  const output = path.join(directory, "installed");
  await promisify(execFile)(process.execPath, [cli, "build", "--out", output], {
    cwd: path.resolve("."),
    env: { ...process.env, PATH: `${path.dirname(process.execPath)}:${path.resolve("node_modules/.bin")}:${process.env.PATH ?? ""}` },
    timeout: 30000,
  });
  const module = { exports: {} as { default?: unknown } };
  const code = await readFile(path.join(output, "bang.js"), "utf8");
  runInNewContext(code, {
    module, exports: module.exports, Buffer, process, TextDecoder,
    __filename: path.join(output, "bang.js"), __dirname: output,
    require: (id: string) => {
      if (id === "@vicinae/api") return {}; // API calls only occur on rendering/actions.
      if (id.startsWith("node:") || id === "react" || id === "react/jsx-runtime") return require(id);
      throw new Error(`Unexpected external dependency in standalone bundle: ${id}`);
    },
  }, { filename: "bang-production-bundle.js", timeout: 5000 });
  assert.equal(typeof module.exports.default, "function");
});
