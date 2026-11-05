import { LocalStorage } from "@vicinae/api";
import type { Conversation, Message } from "./types";

const STORAGE_KEY = "conversations";
const MAX_CONVERSATIONS = 50;

export async function getConversations(): Promise<Conversation[]> {
  const raw = await LocalStorage.getItem<string>(STORAGE_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as Conversation[];
  } catch {
    return [];
  }
}

export async function getConversation(
  id: string,
): Promise<Conversation | undefined> {
  const conversations = await getConversations();
  return conversations.find((c) => c.id === id);
}

export async function saveConversation(
  conversation: Conversation,
): Promise<void> {
  const conversations = await getConversations();
  const index = conversations.findIndex((c) => c.id === conversation.id);

  if (index >= 0) {
    conversations[index] = conversation;
  } else {
    conversations.unshift(conversation);
  }

  // Prune old conversations
  const pruned = conversations.slice(0, MAX_CONVERSATIONS);
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
}

export async function deleteConversation(id: string): Promise<void> {
  const conversations = await getConversations();
  const filtered = conversations.filter((c) => c.id !== id);
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export async function clearConversations(): Promise<void> {
  await LocalStorage.removeItem(STORAGE_KEY);
}

export function buildConversation(
  id: string,
  messages: Message[],
  model: string,
  existing?: Conversation,
  sessionId?: string,
  sessionTitle?: string,
): Conversation {
  // Prefer: sessionTitle (from OpenCode) > existing title > first user message
  const firstUserMessage = messages.find((m) => m.role === "user");
  const fallbackTitle = firstUserMessage
    ? firstUserMessage.content.replace(/\n/g, " ").trim().slice(0, 50)
    : "New conversation";
  const title = sessionTitle ?? existing?.title ?? fallbackTitle;

  return {
    id,
    title,
    messages,
    model,
    sessionId: sessionId ?? existing?.sessionId,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
}
