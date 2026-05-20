/**
 * Custom hook for managing a chat session with persistence and streaming
 * Now decoupled from component lifecycle via ChatManager and ChatStorage reactivity
 */

import { useCallback, useEffect, useState } from "react";
import { getPreferenceValues, showToast, Toast } from "@vicinae/api";
import type { Chat, Preferences } from "../types";
import { ChatStorage } from "../services/chatStorage";
import { EMOJIS, TOAST_MESSAGES } from "../constants";
import {
	describeError,
	generateChatTitleAI,
	sendMessageToClaude,
	streamMessageToClaude,
} from "../services/claudeService";
import { createMessage } from "../utils/messages";
import { formatCharacterCount } from "../utils/formatting";

interface UseChatReturn {
	chat: Chat;
	isLoading: boolean;
	streamingMessage: string | null;
	sendMessage: (userMessage: string) => Promise<void>;
}

/**
 * Simple hook for managing a chat session
 */
export function useChat(initialChat: Chat): UseChatReturn {
	const [chat, setChat] = useState<Chat>(initialChat);
	const [isLoading, setIsLoading] = useState(false);
	const [streamingMessage, setStreamingMessage] = useState<string | null>(null);

	const saveChat = useCallback((updatedChat: Chat) => {
		ChatStorage.saveChat(updatedChat);
	}, []);

	// Sync with storage on mount and subscribe to changes
	useEffect(() => {
		const updateFromStorage = () => {
			const updatedChat = ChatStorage.loadChat(initialChat.id);
			if (updatedChat) {
				setChat(updatedChat);
			}
		};

		updateFromStorage();
		return ChatStorage.subscribe((_key, _data) => {
			updateFromStorage();
		});
	}, [initialChat.id]);

	const sendMessage = useCallback(
		async (userMessageText: string): Promise<void> => {
			if (!userMessageText.trim()) {
				await showToast({
					style: Toast.Style.Failure,
					title: TOAST_MESSAGES.EMPTY_MESSAGE.title,
					message: TOAST_MESSAGES.EMPTY_MESSAGE.message,
				});
				return;
			}

			const preferences = getPreferenceValues<Preferences>();
			if (!preferences.apiKey) {
				await showToast({
					style: Toast.Style.Failure,
					title: TOAST_MESSAGES.API_KEY_MISSING.title,
					message: TOAST_MESSAGES.API_KEY_MISSING.message,
				});
				return;
			}

			// Add user message
			const newUserMessage = createMessage("user", userMessageText);
			const updatedMessages = [...chat.messages, newUserMessage];
			const updatedChat: Chat = {
				...chat,
				messages: updatedMessages,
				updatedAt: new Date(),
			};

			setChat(updatedChat);
			saveChat(updatedChat);

			setIsLoading(true);
			setStreamingMessage(preferences.enableStreaming ? "" : "Thinking...");

			try {
				const common = {
					apiKey: preferences.apiKey,
					messages: updatedMessages,
					model: preferences.model,
					maxTokens: parseInt(preferences.maxTokens, 10),
				} as const;

				const response = preferences.enableStreaming
					? await streamMessageToClaude({
							...common,
							onUpdate: (text) => setStreamingMessage(text),
						})
					: await sendMessageToClaude(common);

				if (!response.success) {
					throw new Error(
						response.error || "Failed to get response from Claude",
					);
				}

				// Add assistant message
				const assistantMessage = createMessage("assistant", response.content);
				const finalMessages = [...updatedMessages, assistantMessage];
				const finalChat: Chat = {
					...updatedChat,
					messages: finalMessages,
					updatedAt: new Date(),
				};

				// Handle title generation
				if (finalChat.title === "New Chat") {
					const newTitle = await generateChatTitleAI(
						preferences.apiKey,
						finalMessages,
						preferences.model,
					);
					if (newTitle) {
						finalChat.title = newTitle;
					}
				}

				setChat(finalChat);
				saveChat(finalChat);

				await showToast({
					style: Toast.Style.Success,
					title: `${EMOJIS.CHECK} ${TOAST_MESSAGES.RESPONSE_RECEIVED.title}`,
					message: formatCharacterCount(response.content.length),
				});
			} catch (error) {
				const msg = describeError(error);
				await showToast({
					style: Toast.Style.Failure,
					title: `${EMOJIS.CROSS} ${TOAST_MESSAGES.ERROR.title}`,
					message: msg,
				});

				const errorMessage = createMessage(
					"assistant",
					`### ${EMOJIS.CROSS} Error\n\n${msg}\n`,
				);
				const errorChat = {
					...updatedChat,
					messages: [...updatedMessages, errorMessage],
					updatedAt: new Date(),
				};
				setChat(errorChat);
				saveChat(errorChat);
			} finally {
				setIsLoading(false);
				setStreamingMessage(null);
			}
		},
		[chat, saveChat],
	);

	return {
		chat,
		isLoading,
		streamingMessage,
		sendMessage,
	};
}
