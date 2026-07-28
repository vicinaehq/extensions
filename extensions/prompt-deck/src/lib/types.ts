export type ProviderType = "openai" | "anthropic" | "google";

export type ContextSource = "selectedText" | "clipboardText";

export interface Preferences {
  provider: ProviderType;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  googleApiKey?: string;
  model: string;
  baseURL?: string;
  temperature?: string;
  reasoningLevel?: string;
  maxOutputTokens?: string;
  enableHistory?: boolean;
}

export interface LlmShortcut {
  id: string;
  name: string;
  alias: string;
  description: string;
  systemPrompt: string;
  defaultCommand: string;
  contextSources: ContextSource[];
  provider?: ProviderType | undefined;
  model?: string | undefined;
  temperature?: number | undefined;
  reasoningLevel?: string | undefined;
  maxOutputTokens?: number | undefined;
  closeWindowOnCopy?: boolean | undefined;
  /** Makes "Paste to Active App" the primary action on the result. */
  pasteToActiveApp?: boolean | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface ContextBlock {
  source: ContextSource;
  title: string;
  content: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ShortcutRun {
  id: string;
  shortcutId: string;
  shortcutName: string;
  command: string;
  contextBlocks: ContextBlock[];
  messages: ChatMessage[];
  model: string;
  provider: ProviderType;
  closeWindowOnCopy?: boolean | undefined;
  createdAt: string;
  updatedAt: string;
}

export type ShortcutFormValues = {
  name: string;
  alias: string;
  description: string;
  systemPrompt: string;
  defaultCommand: string;
  includeSelectedText: boolean;
  includeClipboardText: boolean;
  closeWindowOnCopy: boolean;
  pasteToActiveApp: boolean;
  provider: string;
  model: string;
  temperature: string;
  reasoningLevel: string;
  maxOutputTokens: string;
};

export type CommandFormValues = {
  command: string;
};
