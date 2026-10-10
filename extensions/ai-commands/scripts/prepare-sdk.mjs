import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const sdk = require.resolve("@anthropic-ai/claude-agent-sdk");
const root = new URL("../", import.meta.url);
await mkdir(new URL("assets", root), { recursive: true });
await copyFile(
  new URL("LICENSE", root),
  new URL("assets/ai-commands-LICENSE.txt", root),
);
await copyFile(sdk, new URL("assets/claude-sdk.mjs", root));
await copyFile(
  join(dirname(sdk), "README.md"),
  new URL("assets/claude-sdk-NOTICE.md", root),
);
await copyFile(
  join(dirname(sdk), "LICENSE.md"),
  new URL("assets/claude-sdk-LICENSE.md", root),
);
await copyFile(
  join(dirname(require.resolve("jsonc-parser/package.json")), "LICENSE.md"),
  new URL("assets/jsonc-parser-LICENSE.md", root),
);
