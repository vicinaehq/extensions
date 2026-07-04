import type { Message } from "./types";

/**
 * Format a conversation as markdown for the detail panel.
 *
 * Uses blockquotes (`>`) for user messages to visually distinguish them
 * from AI responses, similar to a messaging app:
 *
 * - **User messages**: rendered as blockquotes (indented with left border)
 * - **AI messages**: rendered as plain text (left-aligned)
 *
 * No separators or role labels — the blockquote styling is enough
 * to tell who said what, keeping vertical space tight.
 */
export function formatConversationMarkdown(
  messages: Message[],
  isLoading: boolean,
): string {
  if (messages.length === 0) {
    return "# OpenCode Chat\n\nType your message and press Enter to start a conversation.";
  }

  const parts: string[] = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      const quoted = msg.content
        .split("\n")
        .map((line, i) => (i === 0 ? `> **» ${line}**` : `> **${line}**`))
        .join("\n");
      parts.push(quoted);
    } else {
      if (msg.content === "" && isLoading) {
        parts.push("*Thinking...*");
      } else {
        parts.push(msg.content);
      }
    }
  }

  return parts.join("\n\n");
}

/**
 * Returns the tail of a conversation markdown — the last exchange
 * onward. Used for static display during navigation so the most
 * recent content is visible at the top of the detail panel.
 */
export function tailConversationMarkdown(markdown: string): string {
  // Find the last user message (blockquote) boundary
  const lastQuote = markdown.lastIndexOf("\n\n> ");
  if (lastQuote === -1) {
    // No user message found, show the last paragraph
    const lastBreak = markdown.lastIndexOf("\n\n");
    if (lastBreak === -1) return markdown;
    return markdown.slice(lastBreak + 2);
  }
  return markdown.slice(lastQuote + 2);
}
