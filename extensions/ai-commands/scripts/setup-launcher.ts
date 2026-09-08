import { parseArgs } from "node:util";
import { configureLauncher } from "../src/core/launcher-setup";

async function main() {
  const { values } = parseArgs({ options: { launcher: { type: "string" } } });
  const result = await configureLauncher({ launcher: values.launcher });
  console.log(
    result.status === "enabled"
      ? "Root search is enabled."
      : "Root search configured. Restart Vicinae and open Setup AI Commands to finish.",
  );
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
