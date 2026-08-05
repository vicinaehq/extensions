export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  sessionId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Preferences {
  model: string;
  systemPrompt?: string;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function truncate(text: string, maxLength = 80): string {
  const oneLine = text.replace(/\n/g, " ").trim();
  if (oneLine.length <= maxLength) return oneLine;
  return oneLine.slice(0, maxLength - 1) + "\u2026";
}

export function conversationTitle(firstMessage: string): string {
  return truncate(firstMessage, 50);
}

/** Extract the provider name from a "provider/model" string. */
export function providerOf(model: string): string {
  const slash = model.indexOf("/");
  return slash >= 0 ? model.slice(0, slash) : model;
}

/** Extract a short display name from a "provider/model" string.
 *  e.g. "anthropic/claude-sonnet-4-20250514" → "sonnet"
 *       "openai/gpt-4o-mini" → "4o-mini"
 *       "google/gemini-2.0-flash" → "flash"
 */
export function modelName(model: string): string {
  const slash = model.indexOf("/");
  let name = slash >= 0 ? model.slice(slash + 1) : model;

  // Strip known prefixes
  name = name
    .replace(/^claude-/, "")
    .replace(/^gpt-/, "")
    .replace(/^gemini-[\d.]+-/, "")
    .replace(/^deepseek-/, "")
    .replace(/^mistral-/, "")
    .replace(/^llama-/, "");

  // Strip date suffixes like -20250514
  name = name.replace(/-\d{8}$/, "");

  return name;
}

/** Format a relative date string from a timestamp. */
export function relativeDate(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return new Date(timestamp).toLocaleDateString();
}


