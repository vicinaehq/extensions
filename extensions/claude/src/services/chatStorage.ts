/**
 * Chat Storage Service
 * Manages persistent storage of chat sessions using Vicinae Cache API
 */

import {Cache} from "@vicinae/api";
import type {Chat} from "../types";

const CHATS_INDEX_KEY = "chats_index";
const CHAT_KEY_PREFIX = "chat_";

const cache = new Cache({namespace: "chats"});

type ChatChangeListener = () => void;

export const ChatStorage = {
    subscribe(listener: ChatChangeListener): () => void {
        return cache.subscribe(() => listener());
    },

    getChatIndex(): string[] {
        const indexJson = cache.get(CHATS_INDEX_KEY);
        return indexJson ? JSON.parse(indexJson) : [];
    },

    updateChatIndex(chatIds: string[]): void {
        cache.set(CHATS_INDEX_KEY, JSON.stringify(chatIds));
    },

    serializeChat(chat: Chat): string {
        return JSON.stringify(chat, (key, value) => {
            if (value instanceof Date) {
                return value.toISOString();
            }
            return value;
        });
    },

    deserializeChat(json: string): Chat {
        return JSON.parse(json, (key, value) => {
            if (["timestamp", "createdAt", "updatedAt"].includes(key)) {
                return new Date(value);
            }
            return value;
        });
    },

    saveChat(chat: Chat): void {
        const chatKey = `${CHAT_KEY_PREFIX}${chat.id}`;
        cache.set(chatKey, this.serializeChat(chat));

        const index = this.getChatIndex();
        if (!index.includes(chat.id)) {
            this.updateChatIndex([chat.id, ...index]);
        }
    },

    loadChat(chatId: string): Chat | null {
        const chatKey = `${CHAT_KEY_PREFIX}${chatId}`;
        const chatJson = cache.get(chatKey);
        return chatJson ? this.deserializeChat(chatJson) : null;
    },

    loadAllChats(): Chat[] {
        const index = this.getChatIndex();
        return index
            .map((id) => this.loadChat(id))
            .filter((chat): chat is Chat => chat !== null)
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    },

    deleteChat(chatId: string): boolean {
        const chatKey = `${CHAT_KEY_PREFIX}${chatId}`;
        const removed = cache.remove(chatKey);

        if (removed) {
            const index = this.getChatIndex();
            this.updateChatIndex(index.filter((id) => id !== chatId));
        }

        return removed;
    },

    createNewChat(): Chat {
        return {
            id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            title: "New Chat",
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    },

    clearAllChats(): void {
        cache.clear();
    },
};
