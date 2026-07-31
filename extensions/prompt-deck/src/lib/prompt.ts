import { buildContextPreviewMarkdown } from "./context-preview";
import { formatProvider } from "./providers";
import { trimText } from "./string";
import type { ChatMessage, ContextBlock, LlmShortcut, ShortcutRun } from "./types";

export interface ModelPromptMessage {
  role: "user" | "assistant";
  content: string;
}

export const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful assistant. Use the provided context carefully and answer in clear markdown.";

/**
 * Builds a multi-turn model prompt while keeping UI messages compact.
 */
export function buildChatPrompt(shortcut: LlmShortcut, messages: ChatMessage[], contextBlocks: ContextBlock[]) {
  return {
    system: trimText(shortcut.systemPrompt) || DEFAULT_SYSTEM_PROMPT,
    messages: messages.map((message, index): ModelPromptMessage => {
      if (index === 0 && message.role === "user") {
        return {
          role: "user",
          content: buildContextualUserMessage(trimText(message.content), contextBlocks),
        };
      }

      return {
        role: message.role,
        content: trimText(message.content),
      };
    }),
  };
}

/**
 * Renders an active chat transcript for Vicinae Detail views.
 */
export function buildChatMarkdown(params: {
  contextBlocks: ContextBlock[];
  messages: ChatMessage[];
  isStreaming?: boolean;
  error?: string;
}): string {
  const sections: string[] = [];

  if (params.contextBlocks.length) {
    sections.push(`## Context Preview\n${buildContextPreviewMarkdown(params.contextBlocks)}`);
  }

  if (params.messages.length) {
    sections.push(params.messages.map(formatMessage).join("\n\n---\n\n"));
  }

  if (params.isStreaming && params.messages.at(-1)?.role !== "assistant") {
    sections.push("## Assistant\nThinking...");
  }

  if (params.error) {
    sections.push(`## Error\n${trimText(params.error)}`);
  }

  if (!sections.length) {
    sections.push("_Preparing chat..._");
  }

  return sections.join("\n\n---\n\n");
}

/**
 * Renders the current turn only, keeping streaming output visible without body auto-scroll.
 */
export function buildCurrentTurnMarkdown(params: {
  messages: ChatMessage[];
  isStreaming?: boolean;
  error?: string;
}): string {
  const latestAssistant = findLatestMessage(params.messages, "assistant");
  const sections: string[] = [];

  if (latestAssistant) {
    sections.push(trimText(latestAssistant.content) || "_Thinking..._");
  } else if (params.isStreaming) {
    sections.push("_Thinking..._");
  }

  if (params.error) {
    sections.push(`## Error\n${trimText(params.error)}`);
  }

  if (!sections.length) {
    sections.push("_Preparing result..._");
  }

  return sections.join("\n\n---\n\n");
}

function buildContextualUserMessage(command: string, contextBlocks: ContextBlock[]): string {
  const context = contextBlocks.length
    ? contextBlocks.map((block) => `## ${trimText(block.title)}\n${trimText(block.content)}`).join("\n\n")
    : "No contextual information was captured.";

  return [`# Context`, context, `# User Command`, trimText(command)].join("\n\n");
}

function formatMessage(message: ChatMessage): string {
  const title = message.role === "user" ? "You" : "Assistant";
  return `## ${title}\n${trimText(message.content) || "_Thinking..._"}`;
}

/**
 * Renders a persisted run, transcript plus provenance, for the history view.
 */
export function buildHistoryMarkdown(run: ShortcutRun): string {
  return [
    buildChatMarkdown({
      contextBlocks: run.contextBlocks ?? [],
      messages: run.messages ?? [],
    }),
    `## Metadata\nProvider: ${formatProvider(run.provider)}\n\nModel: ${trimText(run.model)}\n\nCreated: ${new Date(trimText(run.createdAt)).toLocaleString()}`,
  ].join("\n\n---\n\n");
}

/**
 * Finds the newest message with the given role. With `requireContent`, empty
 * messages (e.g. a still-streaming assistant placeholder) are skipped.
 */
export function findLatestMessage(
  messages: ChatMessage[],
  role: ChatMessage["role"],
  requireContent = false,
): ChatMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === role && (!requireContent || trimText(message.content))) {
      return message;
    }
  }

  return undefined;
}
