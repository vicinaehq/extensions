/**
 * Custom hook for managing a chat session with persistence and streaming
 */

import { useCallback, useEffect, useState } from "react";
import { getPreferenceValues, showToast, Toast } from "@vicinae/api";
import type { Chat, Message, Preferences } from "../types";
import {
	describeError,
	sendMessageToClaude,
	streamMessageToClaude,
	generateChatTitleAI,
} from "../services/claudeService";
import { saveChat } from "../services/chatStorage";
import { EMOJIS, TOAST_MESSAGES } from "../constants";
import { formatCharacterCount } from "../utils/formatting";

interface UseChatReturn {
	chat: Chat;
	isLoading: boolean;
	streamingMessage: string | null;
	sendMessage: (userMessage: string) => Promise<void>;
}

/**
 * Generate a unique message ID
 */
const generateMessageId = () =>
	(globalThis.crypto?.randomUUID?.() as string | undefined) ??
	`msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

/**
 * Hook for managing a chat session with auto-save and streaming support
 */
export function useChat(initialChat: Chat): UseChatReturn {
	const [chat, setChat] = useState<Chat>(initialChat);
	const [isLoading, setIsLoading] = useState(false);
	const [streamingMessage, setStreamingMessage] = useState<string | null>(null);

	// Auto-save chat whenever it changes (but not during streaming)
	useEffect(() => {
		if (chat.messages.length > 0 && !isLoading) {
			saveChat(chat);
		}
	}, [chat, isLoading]);

	const sendMessage = useCallback(
		async (userMessage: string): Promise<void> => {
			// Validate message
			if (!userMessage.trim()) {
				await showToast({
					style: Toast.Style.Failure,
					title: TOAST_MESSAGES.EMPTY_MESSAGE.title,
					message: TOAST_MESSAGES.EMPTY_MESSAGE.message,
				});
				return;
			}

			// Get preferences
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
			const newUserMessage: Message = {
				id: generateMessageId(),
				role: "user",
				content: userMessage,
				timestamp: new Date(),
			};

			const updatedMessages = [...chat.messages, newUserMessage];

			// Update chat with user message
			setChat((prev) => ({
				...prev,
				messages: updatedMessages,
				updatedAt: new Date(),
			}));

			setIsLoading(true);

			// Initialize placeholder message for both streaming and non-streaming
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
							onUpdate: setStreamingMessage,
						})
					: await sendMessageToClaude(common);

				if (!response.success) {
					throw new Error(
						response.error || "Failed to get response from Claude",
					);
				}

				// Add assistant message with final content
				const assistantMessage: Message = {
					id: generateMessageId(),
					role: "assistant",
					content: response.content,
					timestamp: new Date(),
				};

				// Update chat with final assistant message
				setChat((prev) => ({
					...prev,
					messages: [...updatedMessages, assistantMessage],
					updatedAt: new Date(),
				}));

				// Automatically generate title if it's the first exchange
				if (chat.title === "New Chat") {
					generateChatTitleAI(
						preferences.apiKey,
						[...updatedMessages, assistantMessage],
						preferences.model,
					).then((newTitle) => {
						if (newTitle) {
							setChat((prev) => ({
								...prev,
								title: newTitle,
							}));
						}
					});
				}

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

				setChat((prev) => ({
					...prev,
					messages: [
						...updatedMessages,
						{
							id: generateMessageId(),
							role: "assistant",
							content: `### ${EMOJIS.CROSS} Error\n\n${msg}\n`,
							timestamp: new Date(),
						},
					],
					updatedAt: new Date(),
				}));
			} finally {
				setIsLoading(false);
				setStreamingMessage(null);
			}
		},
		[chat.messages],
	);

	return {
		chat,
		isLoading,
		streamingMessage,
		sendMessage,
	};
}
