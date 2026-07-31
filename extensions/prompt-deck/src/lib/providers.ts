import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { SharedV4ProviderOptions } from "@ai-sdk/provider";
import type { LanguageModel } from "ai";
import type { ProviderType } from "./types";

export type ReasoningLevel = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface ProviderModelConfig {
  apiKey: string;
  model: string;
  baseURL?: string | undefined;
}

/**
 * Everything the extension needs to know about one LLM provider.
 * Adding a provider means adding one entry here plus one API key preference in package.json.
 */
export interface ProviderDefinition {
  id: ProviderType;
  /** Short name for display and error messages, where space is tight. */
  label: string;
  /** Shown when picking a provider, where there is room to signal compatibility. */
  selectionTitle: string;
  apiKeyPreference: "openaiApiKey" | "anthropicApiKey" | "googleApiKey";
  supportsBaseURL: boolean;
  temperature: { min: number; max: number };
  /**
   * Values this provider is known to accept, shown as a hint. Not a whitelist —
   * providers add levels over time, and an OpenAI-compatible endpoint may take
   * something else entirely, so whatever the user sets is passed through.
   */
  suggestedReasoningLevels: readonly ReasoningLevel[];
  modelPlaceholder: string;
  createModel(config: ProviderModelConfig): LanguageModel;
  buildReasoningOptions(level: string): SharedV4ProviderOptions;
}

export const PROVIDERS: readonly ProviderDefinition[] = [
  {
    id: "openai",
    label: "OpenAI",
    selectionTitle: "OpenAI or Compatible",
    apiKeyPreference: "openaiApiKey",
    supportsBaseURL: true,
    temperature: { min: 0, max: 2 },
    suggestedReasoningLevels: ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
    modelPlaceholder: "gpt-4o-mini",
    createModel: (config) =>
      createOpenAI({ apiKey: config.apiKey, ...(config.baseURL ? { baseURL: config.baseURL } : {}) })(config.model),
    buildReasoningOptions: (level) => ({ openai: { reasoningEffort: level } }),
  },
  {
    id: "anthropic",
    label: "Anthropic",
    selectionTitle: "Anthropic",
    apiKeyPreference: "anthropicApiKey",
    supportsBaseURL: false,
    temperature: { min: 0, max: 1 },
    suggestedReasoningLevels: ["low", "medium", "high", "xhigh", "max"],
    modelPlaceholder: "claude-sonnet-4-5",
    createModel: (config) => createAnthropic({ apiKey: config.apiKey })(config.model),
    buildReasoningOptions: (level) => ({ anthropic: { effort: level } }),
  },
  {
    id: "google",
    label: "Google",
    selectionTitle: "Google",
    apiKeyPreference: "googleApiKey",
    supportsBaseURL: false,
    temperature: { min: 0, max: 2 },
    suggestedReasoningLevels: ["minimal", "low", "medium", "high"],
    modelPlaceholder: "gemini-2.5-flash",
    createModel: (config) => createGoogleGenerativeAI({ apiKey: config.apiKey })(config.model),
    buildReasoningOptions: (level) => ({ google: { thinkingConfig: { thinkingLevel: level } } }),
  },
];

export function getProvider(id: ProviderType): ProviderDefinition {
  const provider = PROVIDERS.find((definition) => definition.id === id);
  if (!provider) {
    throw new Error(`Unknown provider "${id}".`);
  }

  return provider;
}

export function parseProviderId(value: unknown): ProviderType | undefined {
  return PROVIDERS.find((definition) => definition.id === value)?.id;
}

export function formatProvider(id: ProviderType): string {
  return getProvider(id).label;
}
