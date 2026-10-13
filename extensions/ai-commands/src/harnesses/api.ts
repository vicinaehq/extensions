import {
  HARNESS_NAMES,
  MAX_TEXT_LENGTH,
  type ApiId,
  type ModelInfo,
  type RunRequest,
} from "../core/types";
import {
  array,
  object,
  readEvents,
  readJson,
  requestSignal,
  type JsonObject,
} from "./http";

export const API_ENDPOINTS: Record<ApiId, string> = {
  "openai-api": "https://api.openai.com/v1",
  "anthropic-api": "https://api.anthropic.com/v1",
  "xai-api": "https://api.x.ai/v1",
};

type Fetcher = typeof fetch;

function keyFor(harness: ApiId, key?: string): string {
  if (!key?.trim())
    throw new Error(
      `Add your ${HARNESS_NAMES[harness]} key in extension preferences, then refresh models. API access is billed separately by the provider.`,
    );
  return key.trim();
}

function safeError(harness: ApiId, key: string, error: unknown): Error {
  const message =
    error instanceof Error ? error.message : "Unexpected provider response.";
  return new Error(
    `${HARNESS_NAMES[harness]}: ${message.replaceAll(key, "[redacted]").slice(0, 1500)}`,
  );
}

async function apiRequest(
  harness: ApiId,
  key: string,
  path: string,
  signal: AbortSignal,
  fetcher: Fetcher,
  body?: JsonObject,
): Promise<Response> {
  const response = await fetcher(API_ENDPOINTS[harness] + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(harness === "anthropic-api"
        ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
        : { Authorization: `Bearer ${key}` }),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal,
    redirect: "error",
  });
  if (!response.ok) {
    // Provider error bodies can echo request text or credentials. Status and
    // allowlisted error codes suffice for actionable, non-sensitive feedback.
    let code = "";
    try {
      const error = object((await readJson(response)).error);
      const value = error.code ?? error.type;
      if (typeof value === "string" && /^[a-z_]{1,80}$/.test(value))
        code = ` (${value})`;
    } catch {
      /* Status remains available if the body is not JSON. */
    }
    const hint =
      response.status === 401
        ? "Check your API key."
        : response.status === 403
          ? "This key does not have access to this resource."
          : response.status === 429
            ? "Check your API balance and rate limits."
            : response.status === 400
              ? "Check that this model supports the selected thinking level. Try Provider default."
              : "Check the provider status and try again.";
    throw new Error(`HTTP ${response.status}${code}. ${hint}`);
  }
  return response;
}

function anthropicModel(raw: JsonObject): ModelInfo {
  const capabilities = object(raw.capabilities);
  const effort = object(capabilities.effort);
  const thinking = object(object(capabilities.thinking).types);
  const adaptive = object(thinking.adaptive).supported === true;
  const budget = object(thinking.enabled).supported === true;
  const efforts =
    effort.supported === true
      ? Object.entries(effort)
          .filter(([, value]) => object(value).supported === true)
          .map(([key]) => key)
      : [];
  return {
    id: String(raw.id),
    name:
      typeof raw.display_name === "string" ? raw.display_name : String(raw.id),
    efforts: efforts.length
      ? efforts
      : budget
        ? ["enabled"]
        : adaptive
          ? ["adaptive"]
          : [],
    adaptiveThinking: adaptive,
    budgetThinking: budget,
    ...(typeof raw.max_tokens === "number" && raw.max_tokens > 0
      ? { maxOutputTokens: raw.max_tokens }
      : {}),
    effortInfo:
      budget && !adaptive && !efforts.length
        ? "Enabled uses a 4,096-token thinking budget."
        : undefined,
  };
}

export async function apiModels(
  harness: ApiId,
  apiKey?: string,
  signal?: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<ModelInfo[]> {
  const key = keyFor(harness, apiKey);
  try {
    const active = requestSignal(signal, 30_000);
    const models: ModelInfo[] = [];
    const cursors = new Set<string>();
    let cursor = "";
    do {
      const path =
        harness === "anthropic-api"
          ? `/models?limit=1000${cursor ? `&after_id=${encodeURIComponent(cursor)}` : ""}`
          : harness === "xai-api"
            ? "/language-models"
            : "/models";
      const data = await readJson(
        await apiRequest(harness, key, path, active, fetcher),
      );
      const entries = harness === "xai-api" ? data.models : data.data;
      if (!Array.isArray(entries))
        throw new Error("The models response has an unsupported format.");
      for (const value of entries) {
        const raw = object(value);
        if (typeof raw.id !== "string" || !raw.id) continue;
        if (harness === "anthropic-api") models.push(anthropicModel(raw));
        else {
          // /models publishes no modality or per-model reasoning schema. Hide
          // clearly non-text products; the provider validates other capabilities.
          if (
            harness === "xai-api"
              ? !array(raw.output_modalities).includes("text")
              : /(embedding|moderation|whisper|tts|dall-e|image|sora|realtime|audio|transcrib)/i.test(
                  raw.id,
                )
          )
            continue;
          models.push({
            id: raw.id,
            name: raw.id,
            efforts:
              harness === "openai-api"
                ? ["none", "minimal", "low", "medium", "high", "xhigh"]
                : ["none", "low", "medium", "high", "xhigh"],
            effortInfo:
              "This API does not report supported thinking levels per model. Provider default is safest; unsupported choices return an error.",
            description:
              "Loaded from your API account. Text generation and thinking support are validated by the provider when you run the command.",
          });
        }
      }
      cursor =
        harness === "anthropic-api" &&
        data.has_more === true &&
        typeof data.last_id === "string"
          ? data.last_id
          : "";
      if (cursor && cursors.has(cursor))
        throw new Error("The model catalog repeated a pagination cursor.");
      if (cursor) cursors.add(cursor);
      if (data.has_more === true && harness === "anthropic-api" && !cursor)
        throw new Error("The model catalog omitted its pagination cursor.");
    } while (cursor);
    return models;
  } catch (error) {
    throw safeError(harness, key, error);
  }
}

function completedResponsesText(response: JsonObject): string {
  if (response.status !== "completed" || response.error)
    throw new Error(
      "The provider did not complete the response. Partial output will not be pasted.",
    );
  let text = "";
  for (const item of array(response.output).map(object)) {
    if (item.type === "reasoning") continue;
    if (
      item.type !== "message" ||
      item.role !== "assistant" ||
      (item.status && item.status !== "completed")
    )
      throw new Error(
        "The provider returned an unfinished message or a tool request.",
      );
    for (const part of array(item.content).map(object)) {
      if (part.type === "refusal")
        throw new Error("The provider declined this request.");
      if (part.type === "output_text" && typeof part.text === "string")
        text += part.text;
    }
  }
  return text;
}

export async function runApi(
  request: RunRequest,
  fetcher: Fetcher = fetch,
): Promise<string> {
  const harness = request.command.harness as ApiId;
  const key = keyFor(harness, request.apiKey);
  try {
    const active = requestSignal(request.signal);
    const { command } = request;
    let body: JsonObject;
    if (harness === "anthropic-api") {
      const model = (await apiModels(harness, key, active, fetcher)).find(
        (model) => model.id === command.model,
      );
      if (!model)
        throw new Error(
          "The saved model is no longer available. Edit the command and refresh models.",
        );
      if (command.effort && !model.efforts.includes(command.effort))
        throw new Error(
          "This thinking level is no longer supported. Edit the command.",
        );
      const maxTokens = Math.min(model.maxOutputTokens ?? 16_384, 32_768);
      body = {
        model: command.model,
        max_tokens: maxTokens,
        stream: true,
        messages: [{ role: "user", content: request.prompt }],
        ...(command.systemPrompt ? { system: command.systemPrompt } : {}),
      };
      if (command.effort) {
        if (model.adaptiveThinking) body.thinking = { type: "adaptive" };
        else if (model.budgetThinking)
          body.thinking = {
            type: "enabled",
            budget_tokens: Math.min(4096, maxTokens - 1),
          };
        if (command.effort !== "enabled" && command.effort !== "adaptive")
          body.output_config = { effort: command.effort };
      }
    } else {
      body = {
        model: command.model,
        input: [{ role: "user", content: request.prompt }],
        stream: true,
        store: false,
        ...(command.systemPrompt ? { instructions: command.systemPrompt } : {}),
        ...(command.effort ? { reasoning: { effort: command.effort } } : {}),
      };
    }
    const response = await apiRequest(
      harness,
      key,
      harness === "anthropic-api" ? "/messages" : "/responses",
      active,
      fetcher,
      body,
    );
    let text = "",
      complete = false,
      stopReason = "";
    const append = (delta: unknown) => {
      if (typeof delta !== "string") return;
      text += delta;
      if (text.length > MAX_TEXT_LENGTH)
        throw new Error("The result is too large.");
      request.onText(text);
    };
    for await (const event of readEvents(response)) {
      request.signal.throwIfAborted();
      if (
        event.type === "error" ||
        event.type === "response.failed" ||
        event.type === "response.incomplete"
      )
        throw new Error(
          "Generation failed or was cut short by the provider. Partial output will not be pasted.",
        );
      if (harness === "anthropic-api") {
        if (event.type === "content_block_start") {
          const block = object(event.content_block);
          if (block.type === "tool_use" || block.type === "server_tool_use")
            throw new Error("Unexpected tool request.");
          if (block.type === "text") append(block.text);
        }
        if (
          event.type === "content_block_delta" &&
          object(event.delta).type === "text_delta"
        )
          append(object(event.delta).text);
        if (
          event.type === "message_delta" &&
          typeof object(event.delta).stop_reason === "string"
        )
          stopReason = String(object(event.delta).stop_reason);
        if (event.type === "message_stop") {
          if (stopReason !== "end_turn" && stopReason !== "stop_sequence")
            throw new Error(
              "The provider did not complete the answer. Partial output will not be pasted.",
            );
          complete = true;
          break;
        }
      } else {
        if (event.type === "response.output_text.delta") append(event.delta);
        if (event.type === "response.refusal.delta")
          throw new Error("The provider declined this request.");
        if (event.type === "response.completed") {
          text = completedResponsesText(object(event.response));
          complete = true;
          break;
        }
      }
    }
    if (!complete || !text.trim())
      throw new Error(
        "The provider returned no complete text response. Partial output will not be pasted.",
      );
    if (text.length > MAX_TEXT_LENGTH)
      throw new Error("The result is too large.");
    active.throwIfAborted();
    request.onText(text);
    return text;
  } catch (error) {
    throw safeError(harness, key, error);
  }
}
