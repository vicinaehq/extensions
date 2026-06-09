export type Mode = "translate" | "summarize" | "explain" | "enhance" | "dictionary";

export type EnhanceStyle = "professional" | "casual" | "humorous" | "academic" | "persuasive" | "concise" | "storytelling" | "inspiring";

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
}

export interface HistoryEntry {
  id: string;
  mode: Mode;
  input: string;
  output: string;
  model: string;
  targetLanguage: string;
  timestamp: number;
}

export interface ExtensionPreferences {
  ollamaUrl: string;
  defaultModel: string;
  targetLanguage: string;
  maxHistorySize: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
