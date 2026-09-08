import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(new URL("../package.json", import.meta.url));
const output = resolve(process.argv[2] ?? "dist");
const manifest = JSON.parse(
  await readFile(join(output, "package.json"), "utf8"),
);
const api = {
  environment: {
    assetsPath: join(output, "assets"),
    supportPath: "/tmp/ai-commands",
    ownerOrAuthorName: "vdmkotai",
  },
  LocalStorage: {},
  Icon: {},
  Toast: { Style: {} },
  PopToRootType: {},
};

// Exercise module initialization without rendering or touching desktop state.
// The original static SDK import crashed with createRequire(undefined) here.
for (const command of manifest.commands) {
  const filename = join(output, `${command.name}.js`);
  const source = await readFile(filename, "utf8");
  const module = { exports: {} };
  new Function(
    "require",
    "module",
    "exports",
    "__dirname",
    "__filename",
    source,
  )(
    (id) => (id === "@vicinae/api" ? api : require(id)),
    module,
    module.exports,
    output,
    filename,
  );
  assert.equal(
    typeof module.exports.default,
    "function",
    `${command.name}: missing command export`,
  );
}

const assetPath = join(output, "assets", "claude-sdk.mjs");
const originalSdk = await readFile(
  require.resolve("@anthropic-ai/claude-agent-sdk"),
);
assert.ok(
  (await readFile(assetPath)).equals(originalSdk),
  "SDK asset differs from installed SDK",
);
assert.equal(
  typeof (await import(pathToFileURL(assetPath).href)).query,
  "function",
);
assert.ok(
  (await readFile(join(output, "assets", "ai-commands-LICENSE.txt"))).equals(
    await readFile(new URL("../LICENSE", import.meta.url)),
  ),
);
await readFile(join(output, "assets", "claude-sdk-LICENSE.md"));
console.log(
  `Packaging smoke passed: ${manifest.commands.length} commands, native ESM SDK, and license notices`,
);
