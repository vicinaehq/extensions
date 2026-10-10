export const CLI_IDS = ["claude", "codex", "grok", "opencode"] as const;
export const API_IDS = ["openai-api", "anthropic-api", "xai-api"] as const;
export type CliId = (typeof CLI_IDS)[number];
export type ApiId = (typeof API_IDS)[number];
export const HARNESS_IDS = [...CLI_IDS, ...API_IDS] as const;
export type HarnessId = (typeof HARNESS_IDS)[number];
export const HARNESS_NAMES: Record<HarnessId, string> = {
  claude: "Claude Code",
  codex: "Codex",
  grok: "Grok",
  opencode: "OpenCode",
  "openai-api": "OpenAI API",
  "anthropic-api": "Anthropic API",
  "xai-api": "xAI API",
};

export function isApiHarness(harness: HarnessId): harness is ApiId {
  return (API_IDS as readonly string[]).includes(harness);
}

export interface HarnessConnection {
  executable: string;
  apiKey?: string;
}

export interface AICommand {
  schemaVersion: 1;
  id: string;
  name: string;
  prompt: string;
  systemPrompt: string;
  harness: HarnessId;
  model: string;
  effort: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  efforts: string[];
  defaultEffort?: string;
  isDefault?: boolean;
  effortInfo?: string;
  maxOutputTokens?: number;
  adaptiveThinking?: boolean;
  budgetThinking?: boolean;
}

export interface InputSnapshot {
  selection?: string;
  clipboard?: string;
}

export interface HistoryEntry {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  command: AICommand;
  input: InputSnapshot;
  renderedPrompt: string;
  result: string;
}

export interface RunRequest extends HarnessConnection {
  command: AICommand;
  prompt: string;
  signal: AbortSignal;
  onText: (text: string) => void;
}

export const DEFAULT_SYSTEM_PROMPT =
  "You transform text according to the user's instruction. Return only the resulting plain text, without introductions, explanations, surrounding quotes, or Markdown fences unless explicitly requested. Do not use tools.";

export const MAX_TEXT_LENGTH = 512_000;

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
