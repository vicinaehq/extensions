import { useEffect, useState } from "react";
import type { Chat } from "../types";
import { ChatStorage } from "../services/chatStorage";

/**
 * Hook for managing the list of all chats with auto-refresh
 */
export function useChatHistory() {
	const [chats, setChats] = useState<Chat[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const load = () => {
			const loadedChats = ChatStorage.loadAllChats();
			setChats(loadedChats);
			setIsLoading(false);
		};

		load();
		return ChatStorage.subscribe(load);
	}, []);

	const sortedChats = [...chats].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

	return {
		chats: sortedChats,
		isLoading,
		deleteChat: ChatStorage.deleteChat.bind(ChatStorage),
		createNewChat: ChatStorage.createNewChat.bind(ChatStorage),
		loadChat: ChatStorage.loadChat.bind(ChatStorage),
	};
}
