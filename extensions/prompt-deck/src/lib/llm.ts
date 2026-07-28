import type { SharedV4ProviderOptions } from "@ai-sdk/provider";
import { getPreferenceValues } from "@vicinae/api";
import { APICallError, streamText, type ModelMessage } from "ai";
import { resolveMaxOutputTokens, resolveReasoningLevel, resolveTemperature } from "./model-settings";
import type { ModelPromptMessage } from "./prompt";
import { getProvider } from "./providers";
import { trimText } from "./string";
import type { LlmShortcut, Preferences, ProviderType } from "./types";

/** Placeholder for endpoints that take no auth; the SDK requires some value. */
const UNUSED_API_KEY = "unused";

export interface ResolvedProviderConfig {
  provider: ProviderType;
  apiKey: string;
  model: string;
  baseURL?: string | undefined;
  temperature?: number | undefined;
  reasoningLevel?: string | undefined;
  maxOutputTokens?: number | undefined;
  providerOptions?: SharedV4ProviderOptions | undefined;
}

export interface LlmDisplayConfig {
  provider: ProviderType;
  model: string;
}

/**
 * Wraps AI SDK provider creation and text generation.
 */
export class LlmService {
  async stream(
    shortcut: LlmShortcut,
    system: string,
    messages: ModelPromptMessage[],
    options: {
      onStart?: (config: LlmDisplayConfig) => void;
      onDelta?: (delta: string) => void;
      signal?: AbortSignal;
    } = {},
  ): Promise<{ text: string; config: ResolvedProviderConfig }> {
    const config = this.resolveConfig(shortcut);
    const model = getProvider(config.provider).createModel(config);
    options.onStart?.(toDisplayConfig(config));

    // streamText does not throw on API failures — errors only reach the
    // onError callback while the text stream ends normally. Capture and
    // rethrow so callers see a failed run instead of an empty success.
    let streamError: unknown;
    const result = streamText({
      model,
      system,
      messages: messages as ModelMessage[],
      onError: ({ error }) => {
        streamError = error;
      },
      ...(config.temperature === undefined ? {} : { temperature: config.temperature }),
      ...(config.maxOutputTokens === undefined ? {} : { maxOutputTokens: config.maxOutputTokens }),
      ...(config.providerOptions === undefined ? {} : { providerOptions: config.providerOptions }),
      ...(options.signal === undefined ? {} : { abortSignal: options.signal }),
    });

    let text = "";
    for await (const delta of result.textStream) {
      text += delta;
      options.onDelta?.(delta);
    }

    if (streamError !== undefined) {
      throw toRunError(streamError, getProvider(config.provider).label);
    }

    return { text, config };
  }

  resolveConfig(shortcut: LlmShortcut): ResolvedProviderConfig {
    const preferences = getPreferenceValues<Preferences>();
    const provider = shortcut.provider ?? preferences.provider;
    const definition = getProvider(provider);
    const baseURL = definition.supportsBaseURL ? trimText(preferences.baseURL) : "";
    const configuredKey = trimText(preferences[definition.apiKeyPreference]);
    const model = trimText(shortcut.model) || trimText(preferences.model);

    // Local OpenAI-compatible servers such as Ollama ignore auth, but the SDK
    // still demands a key, so stand one in rather than blocking the run. Hosted
    // endpoints that do need one answer with a 401, which reads clearly.
    const apiKey = configuredKey || (baseURL ? UNUSED_API_KEY : "");

    if (!apiKey) {
      throw new Error(`No API key configured for ${definition.label}. Add one in the extension preferences.`);
    }
    if (!model) {
      throw new Error("Missing model. Add one in the extension preferences or prompt override.");
    }
    const temperature = resolveTemperature(shortcut.temperature ?? preferences.temperature, provider);
    const reasoningLevel = resolveReasoningLevel(shortcut.reasoningLevel ?? preferences.reasoningLevel);
    const maxOutputTokens = resolveMaxOutputTokens(shortcut.maxOutputTokens ?? preferences.maxOutputTokens);
    const providerOptions = reasoningLevel === undefined ? undefined : definition.buildReasoningOptions(reasoningLevel);

    return {
      provider,
      apiKey,
      model,
      ...(baseURL ? { baseURL } : {}),
      temperature,
      reasoningLevel,
      maxOutputTokens,
      ...(providerOptions ? { providerOptions } : {}),
    };
  }
}

/**
 * Normalizes a stream error and appends an actionable hint for auth failures.
 */
function toRunError(error: unknown, providerLabel: string): Error {
  const base = error instanceof Error ? error : new Error(String(error));
  if (APICallError.isInstance(error) && (error.statusCode === 401 || error.statusCode === 403)) {
    return new Error(`${base.message} — check the ${providerLabel} API key in the extension preferences.`);
  }

  return base;
}

function toDisplayConfig(config: ResolvedProviderConfig): LlmDisplayConfig {
  return {
    provider: config.provider,
    model: config.model,
  };
}
