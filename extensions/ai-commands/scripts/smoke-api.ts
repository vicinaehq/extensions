import { apiModels, runApi } from "../src/harnesses/api";
import {
  API_IDS,
  DEFAULT_SYSTEM_PROMPT,
  errorMessage,
  type ApiId,
  type AICommand,
} from "../src/core/types";

async function main() {
  const harness = process.argv[2] as ApiId;
  if (!API_IDS.includes(harness))
    throw new Error(
      "Usage: npm run smoke:api -- <openai-api|anthropic-api|xai-api> [--generate --model MODEL_ID]",
    );
  const variable = {
    "openai-api": "OPENAI_API_KEY",
    "anthropic-api": "ANTHROPIC_API_KEY",
    "xai-api": "XAI_API_KEY",
  }[harness];
  const apiKey = process.env[variable];
  if (!apiKey)
    throw new Error(
      `Set ${variable} in your terminal environment. Never commit API keys.`,
    );
  const models = await apiModels(harness, apiKey);
  console.log(JSON.stringify({ harness, models }, null, 2));
  if (!process.argv.includes("--generate")) return;
  const index = process.argv.indexOf("--model");
  const model =
    index !== -1
      ? models.find((model) => model.id === process.argv[index + 1])
      : undefined;
  if (!model)
    throw new Error(
      "For a billable generation test, explicitly select an available --model MODEL_ID from the catalog.",
    );
  const command: AICommand = {
    schemaVersion: 1,
    id: "smoke",
    name: "Smoke test",
    harness,
    model: model.id,
    effort: "",
    createdAt: "",
    updatedAt: "",
    prompt:
      "Translate into English. Return only the translated text: Доброе утро.",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
  };
  const result = await runApi({
    command,
    prompt: command.prompt,
    executable: "",
    apiKey,
    signal: new AbortController().signal,
    onText: () => {},
  });
  console.log(JSON.stringify({ harness, model: model.id, result }));
}
void main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
