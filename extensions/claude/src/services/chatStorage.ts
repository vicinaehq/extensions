/**
 * Chat Storage Service
 * Manages persistent storage of chat sessions using Vicinae Cache API
 */

import { Cache } from "@vicinae/api";
import type { Chat, Message } from "../types";

const CHATS_INDEX_KEY = "chats_index";
const CHAT_KEY_PREFIX = "chat_";

// Initialize cache instance for chat storage
const cache = new Cache({ namespace: "chats" });

/**
 * Generate a unique chat ID
 */
function generateChatId(): string {
	return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate a chat title from the first user message
 */
function generateChatTitle(messages: Message[]): string {
	const firstUserMessage = messages.find((msg) => msg.role === "user");
	if (!firstUserMessage) {
		return "New Chat";
	}

	// Truncate to first 50 characters
	const title = firstUserMessage.content.trim();
	return title.length > 50 ? `${title.substring(0, 50)}...` : title;
}

/**
 * Serialize chat to JSON string (handling Date objects)
 */
function serializeChat(chat: Chat): string {
	return JSON.stringify(chat, (key, value) => {
		if (value instanceof Date) {
			return value.toISOString();
		}
		return value;
	});
}

/**
 * Deserialize chat from JSON string (converting ISO strings back to Dates)
 */
function deserializeChat(json: string): Chat {
	return JSON.parse(json, (key, value) => {
		if (key === "timestamp" || key === "createdAt" || key === "updatedAt") {
			return new Date(value);
		}
		return value;
	});
}

/**
 * Get list of all chat IDs from index
 */
function getChatIndex(): string[] {
	const indexJson = cache.get(CHATS_INDEX_KEY);
	if (!indexJson) {
		return [];
	}
	return JSON.parse(indexJson);
}

/**
 * Update the chat index with new list of IDs
 */
function updateChatIndex(chatIds: string[]): void {
	cache.set(CHATS_INDEX_KEY, JSON.stringify(chatIds));
}

/**
 * Save a chat session to storage
 */
export function saveChat(chat: Chat): void {
	const chatKey = `${CHAT_KEY_PREFIX}${chat.id}`;

	// Update timestamp
	chat.updatedAt = new Date();

	// Auto-generate title if it's still "New Chat" and messages exist
	if (chat.title === "New Chat" && chat.messages.length > 0) {
		chat.title = generateChatTitle(chat.messages);
	}

	// Save chat data
	cache.set(chatKey, serializeChat(chat));

	// Update index if this is a new chat
	const index = getChatIndex();
	if (!index.includes(chat.id)) {
		index.unshift(chat.id); // Add to beginning (most recent first)
		updateChatIndex(index);
	}
}

/**
 * Load a specific chat by ID
 */
export function loadChat(chatId: string): Chat | null {
	const chatKey = `${CHAT_KEY_PREFIX}${chatId}`;
	const chatJson = cache.get(chatKey);

	if (!chatJson) {
		return null;
	}

	return deserializeChat(chatJson);
}

/**
 * Load all chats (sorted by most recent first)
 */
export function loadAllChats(): Chat[] {
	const index = getChatIndex();
	const chats: Chat[] = [];

	for (const chatId of index) {
		const chat = loadChat(chatId);
		if (chat) {
			chats.push(chat);
		}
	}

	// Sort by updatedAt (most recent first)
	return chats.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/**
 * Delete a chat by ID
 */
export function deleteChat(chatId: string): boolean {
	const chatKey = `${CHAT_KEY_PREFIX}${chatId}`;
	const removed = cache.remove(chatKey);

	if (removed) {
		// Update index
		const index = getChatIndex();
		const newIndex = index.filter((id) => id !== chatId);
		updateChatIndex(newIndex);
	}

	return removed;
}

/**
 * Create a new chat session
 */
export function createNewChat(): Chat {
	return {
		id: generateChatId(),
		title: "New Chat",
		messages: [],
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

/**
 * Clear all chats
 */
export function clearAllChats(): void {
	cache.clear();
}
