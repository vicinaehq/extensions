import {
  isApiHarness,
  type HarnessId,
  type HarnessConnection,
  type ModelInfo,
  type RunRequest,
} from "../core/types";
import { claudeModels, runClaude } from "./claude";
import { codexModels, runCodex } from "./codex";
import { grokModels, runGrok } from "./grok";
import { openCodeModels, runOpenCode } from "./opencode";
import { apiModels, runApi } from "./api";

export async function discoverModels(
  harness: HarnessId,
  connection: HarnessConnection,
  signal?: AbortSignal,
): Promise<ModelInfo[]> {
  const models = await (isApiHarness(harness)
    ? apiModels(harness, connection.apiKey, signal)
    : {
        claude: claudeModels,
        codex: codexModels,
        grok: grokModels,
        opencode: openCodeModels,
      }[harness](connection.executable, signal));
  const distinct = [
    ...new Map(models.map((model) => [model.id, model])).values(),
  ];
  if (!distinct.length)
    throw new Error(
      "The harness returned no available models. Check its login, then refresh.",
    );
  return distinct;
}

export async function runHarness(request: RunRequest): Promise<string> {
  request.signal.throwIfAborted();
  const harness = request.command.harness;
  const result = await (isApiHarness(harness)
    ? runApi(request)
    : {
        claude: runClaude,
        codex: runCodex,
        grok: runGrok,
        opencode: runOpenCode,
      }[harness](request));
  request.signal.throwIfAborted();
  return result;
}
