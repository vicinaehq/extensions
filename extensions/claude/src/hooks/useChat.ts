/**
 * Custom hook for managing a chat session with persistence and streaming
 */

import { useState, useCallback, useEffect } from "react";
import { showToast, Toast, getPreferenceValues } from "@vicinae/api";
import type { Chat, Message, Preferences } from "../types";
import {
	streamMessageToClaude,
	sendMessageToClaude,
} from "../services/claudeService";
import { saveChat } from "../services/chatStorage";
import { TOAST_MESSAGES, EMOJIS } from "../constants";
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
function generateMessageId(): string {
	return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

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
				showToast({
					style: Toast.Style.Failure,
					title: TOAST_MESSAGES.EMPTY_MESSAGE.title,
					message: TOAST_MESSAGES.EMPTY_MESSAGE.message,
				});
				return;
			}

			// Get preferences
			const preferences = getPreferenceValues<Preferences>();
			if (!preferences.apiKey) {
				showToast({
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
			if (preferences.enableStreaming) {
				setStreamingMessage(""); // Will be updated in real-time during streaming
			} else {
				setStreamingMessage("Thinking..."); // Static placeholder for non-streaming
			}

			try {
				let response;

				// Use streaming or non-streaming API based on preference
				if (preferences.enableStreaming) {
					// Send to Claude API with streaming (experimental)
					response = await streamMessageToClaude({
						apiKey: preferences.apiKey,
						messages: updatedMessages,
						model: preferences.model,
						maxTokens: parseInt(preferences.maxTokens, 10),
						onUpdate: (text: string) => {
							// Update streaming message in real-time
							setStreamingMessage(text);
						},
					});
				} else {
					// Send to Claude API without streaming (default, stable)
					response = await sendMessageToClaude({
						apiKey: preferences.apiKey,
						messages: updatedMessages,
						model: preferences.model,
						maxTokens: parseInt(preferences.maxTokens, 10),
					});
				}

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

				showToast({
					style: Toast.Style.Success,
					title: `${EMOJIS.CHECK} ${TOAST_MESSAGES.RESPONSE_RECEIVED.title}`,
					message: formatCharacterCount(response.content.length),
				});
			} catch (error) {
				showToast({
					style: Toast.Style.Failure,
					title: `${EMOJIS.CROSS} ${TOAST_MESSAGES.ERROR.title}`,
					message:
						error instanceof Error
							? error.message
							: "Failed to get response from Claude",
				});
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
