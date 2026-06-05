import { Chat, Message, ContentBlock, SystemContentBlock } from "../type";
import type { ImageFormat } from "@aws-sdk/client-bedrock-runtime";
import path from "node:path";
import * as fs from "node:fs";

function countTokensEstimate(text: string): number {
  // 100 tokens ~= 75 words
  const words = text.split(" ").length;
  return Math.ceil(words / 75) * 100;
}

function limitConversationLength(chats: Chat[]) {
  // Rough token estimate: 100 tokens ~= 75 words
  const maxTokens = 3750;
  const newChats: Chat[] = [];
  let tokens = 0;

  for (const chat of chats) {
    const questionTokens = countTokensEstimate(chat.question);
    const answerTokens = countTokensEstimate(chat.answer);

    tokens = tokens + questionTokens + answerTokens;

    if (tokens > maxTokens) {
      break;
    }

    newChats.push(chat);
  }

  return newChats;
}

/**
 * Convert chat history into Bedrock Converse message format.
 * System prompt is returned separately (Bedrock uses a top-level `system` field).
 */
export function chatTransformer(chat: Chat[], prompt: string): { system: SystemContentBlock[]; messages: Message[] } {
  const system: SystemContentBlock[] = [];
  if (prompt !== "") {
    system.push({ text: prompt });
  }

  const messages: Message[] = [];
  const limitedChat = limitConversationLength(chat);
  limitedChat.forEach(({ question, answer }) => {
    messages.push({ role: "user", content: [{ text: question }] });
    messages.push({ role: "assistant", content: [{ text: answer }] });
  });
  return { system, messages };
}

const formats: { [K: string]: ImageFormat } = {
  ".png": "png",
  ".jpeg": "jpeg",
  ".jpg": "jpeg",
  ".webp": "webp",
  ".gif": "gif",
};

/**
 * Load an image file and return its format + raw bytes for Bedrock.
 */
export const loadImageForBedrock = (file: string): { format: ImageFormat; bytes: Uint8Array } => {
  const fileExtension = path.extname(file);
  const format: ImageFormat = formats[fileExtension] ?? "png";
  const replace = file.replace("file://", "").replace("%20", " ");
  const buffer = fs.readFileSync(replace);
  return { format, bytes: new Uint8Array(buffer) };
};

/**
 * Build Bedrock content blocks for the user message.
 * Returns an array of content blocks (text + optional images).
 */
export const buildUserMessage = (question: string, files?: string[]): ContentBlock[] => {
  const content: ContentBlock[] = [{ text: question }];

  if (files && files.length > 0) {
    files.forEach((img) => {
      const { format, bytes } = loadImageForBedrock(img);
      content.push({
        image: { format, source: { bytes } },
      });
    });
  }

  return content;
};

export const toUnit = (size: number) => {
  const units = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  let unitIndex = 0;
  let unit = units[unitIndex];
  while (size >= 1024) {
    size /= 1024;
    unitIndex++;
    unit = units[unitIndex];
  }
  return `${size.toFixed(2)} ${unit}`;
};

/**
 * A chat item with enough fields for the shared markdown builder and list items.
 */
export interface ChatItem {
  id: string;
  question: string;
  answer: string;
  created_at: string;
}

/**
 * Builds a markdown string for a conversation detail view.
 * During streaming, only the current Q&A pair is shown to avoid scroll resets.
 * Once complete, the full conversation history is shown separated by `---`.
 */
export function buildConversationMarkdown(
  chats: ChatItem[],
  isLoading: boolean,
  streamingChat?: { id: string; answer: string },
  markdownPrefix?: string,
): string {
  const parts: string[] = [];
  if (markdownPrefix) {
    parts.push(markdownPrefix);
  }

  const sorted = [...chats].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  if (isLoading && sorted.length > 0) {
    const current = sorted[sorted.length - 1];
    const answer = streamingChat?.id === current.id ? streamingChat.answer : current.answer;
    parts.push(`🔍 *${current.question}*\n\n${answer ? "💬" : "⏳"} ${answer || "Generating..."}`);
  } else {
    for (const chat of sorted) {
      parts.push(`🔍 *${chat.question}*\n\n💬 ${chat.answer}`);
    }
  }

  return parts.join("\n\n---\n\n");
}

/**
 * Returns the most recently created chat from a list, or undefined if empty.
 */
export function getLatestChat<T extends ChatItem>(chats: T[]): T | undefined {
  return [...chats].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
}

/**
 * Splits a chat list at the given chat ID, returning all chats before it.
 * Used for forking conversations when editing or regenerating a question.
 * Returns `chatIndex` so callers can also slice related arrays (e.g. messages).
 */
export function forkChats<T extends { id: string }>(
  chats: T[],
  editChatId: string,
): { keptChats: T[]; chatIndex: number } {
  const chatIndex = chats.findIndex((c) => c.id === editChatId);
  const keptChats = chatIndex > 0 ? chats.slice(0, chatIndex) : [];
  return { keptChats, chatIndex };
}
