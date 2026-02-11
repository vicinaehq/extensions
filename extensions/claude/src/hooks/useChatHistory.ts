import { useCallback, useEffect, useState } from "react";
import type { Chat } from "../types";
import { ChatStorage } from "../services/chatStorage";

/**
 * Simple hook for managing the list of all chats
 */
export function useChatHistory() {
	const [chats, setChats] = useState<Chat[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	const loadChats = useCallback(() => {
		setIsLoading(true);
		const loadedChats = ChatStorage.loadAllChats();
		setChats([...loadedChats]);
		setIsLoading(false);
	}, []);

	useEffect(() => {
		loadChats();
		// Subscribe to storage changes for reactivity
		return ChatStorage.subscribe((_key, updatedChat) => {
			if (!updatedChat) {
				return;
			}
			loadChats();
		});
	}, [loadChats]);

	const deleteChat = useCallback((chatId: string) => {
		return ChatStorage.deleteChat(chatId);
	}, []);

	const createNewChat = useCallback(() => {
		return ChatStorage.createNewChat();
	}, []);

	return {
		chats,
		isLoading,
		deleteChat,
		createNewChat,
		loadChats,
		loadChat: ChatStorage.loadChat.bind(ChatStorage),
	};
}
