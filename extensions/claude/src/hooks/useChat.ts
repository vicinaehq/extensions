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
import { ChatStorage } from "../services/chatStorage";
import { EMOJIS, TOAST_MESSAGES } from "../constants";
import { formatCharacterCount } from "../utils/formatting";
import { createMessage } from "../utils/messages";

interface UseChatReturn {
	chat: Chat;
	isLoading: boolean;
	streamingMessage: string | null;
	sendMessage: (userMessage: string) => Promise<void>;
}

/**
 * Hook for managing a chat session with auto-save and streaming support
 */
export function useChat(initialChat: Chat): UseChatReturn {
	const [chat, setChat] = useState<Chat>(initialChat);
	const [isLoading, setIsLoading] = useState(false);
	const [streamingMessage, setStreamingMessage] = useState<string | null>(null);

	// Auto-save chat whenever it changes
	useEffect(() => {
		if (chat.messages.length > 0) {
			ChatStorage.saveChat(chat);
		}
	}, [chat]);

	const validateAndGetPreferences = async (): Promise<Preferences | null> => {
		const preferences = getPreferenceValues<Preferences>();
		if (!preferences.apiKey) {
			await showToast({
				style: Toast.Style.Failure,
				title: TOAST_MESSAGES.API_KEY_MISSING.title,
				message: TOAST_MESSAGES.API_KEY_MISSING.message,
			});
			return null;
		}
		return preferences;
	};

	const handleAiResponse = async (
		preferences: Preferences,
		currentMessages: Message[],
	) => {
		const common = {
			apiKey: preferences.apiKey,
			messages: currentMessages,
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
			throw new Error(response.error || "Failed to get response from Claude");
		}

		return response;
	};

	const updateChatWithAssistantMessage = (
		currentMessages: Message[],
		content: string,
	) => {
		const assistantMessage = createMessage("assistant", content);
		const updatedMessages = [...currentMessages, assistantMessage];

		setChat((prev) => ({
			...prev,
			messages: updatedMessages,
			updatedAt: new Date(),
		}));

		return updatedMessages;
	};

	const generateTitleIfNeeded = async (
		preferences: Preferences,
		messages: Message[],
	) => {
		if (chat.title === "New Chat") {
			const newTitle = await generateChatTitleAI(
				preferences.apiKey,
				messages,
				preferences.model,
			);
			if (newTitle) {
				setChat((current) => ({
					...current,
					title: newTitle,
					updatedAt: new Date(),
				}));
			}
		}
	};

	const sendMessage = useCallback(
		async (userMessage: string): Promise<void> => {
			if (!userMessage.trim()) {
				await showToast({
					style: Toast.Style.Failure,
					title: TOAST_MESSAGES.EMPTY_MESSAGE.title,
					message: TOAST_MESSAGES.EMPTY_MESSAGE.message,
				});
				return;
			}

			const preferences = await validateAndGetPreferences();
			if (!preferences) return;

			const newUserMessage = createMessage("user", userMessage);
			const currentMessages = [...chat.messages, newUserMessage];

			setChat((prev) => ({
				...prev,
				messages: currentMessages,
				updatedAt: new Date(),
			}));

			setIsLoading(true);
			setStreamingMessage(preferences.enableStreaming ? "" : "Thinking...");

			try {
				const response = await handleAiResponse(preferences, currentMessages);
				const updatedMessages = updateChatWithAssistantMessage(
					currentMessages,
					response.content,
				);

				await generateTitleIfNeeded(preferences, updatedMessages);

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

				updateChatWithAssistantMessage(
					currentMessages,
					`### ${EMOJIS.CROSS} Error\n\n${msg}\n`,
				);
			} finally {
				setIsLoading(false);
				setStreamingMessage(null);
			}
		},
		[chat.messages, chat.title],
	);

	return {
		chat,
		isLoading,
		streamingMessage,
		sendMessage,
	};
}
