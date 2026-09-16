import { discoverModels, runHarness } from "../src/harnesses";
import { resolveExecutable } from "../src/harnesses/process";
import {
  DEFAULT_SYSTEM_PROMPT,
  CLI_IDS,
  errorMessage,
  type AICommand,
} from "../src/core/types";

async function main() {
  const requested = process.argv[2];
  const ids = requested ? CLI_IDS.filter((id) => id === requested) : CLI_IDS;
  if (!ids.length)
    throw new Error(
      "Usage: npm run smoke -- [claude|codex|grok|opencode] [--generate]",
    );
  for (const harness of ids) {
    try {
      const executable = await resolveExecutable(harness);
      const models = await discoverModels(harness, { executable });
      console.log(JSON.stringify({ harness, executable, models }, null, 2));
      if (process.argv.includes("--generate")) {
        const model = models.find((model) => model.isDefault) ?? models[0]!;
        const now = new Date().toISOString();
        const command: AICommand = {
          schemaVersion: 1,
          id: "smoke",
          name: "Smoke test",
          prompt:
            "Translate into English. Return only the translated text: Доброе утро.",
          systemPrompt: DEFAULT_SYSTEM_PROMPT,
          harness,
          model: model.id,
          effort: model.efforts.includes("low") ? "low" : "",
          createdAt: now,
          updatedAt: now,
        };
        const result = await runHarness({
          command,
          executable,
          prompt: command.prompt,
          signal: new AbortController().signal,
          onText: () => {},
        });
        console.log(JSON.stringify({ harness, result }));
      }
    } catch (error) {
      console.error(JSON.stringify({ harness, error: errorMessage(error) }));
      process.exitCode = 1;
    }
  }
}
void main();
