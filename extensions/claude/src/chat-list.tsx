/**
 * Chat List Command - Browse and manage saved conversations
 */

import React, { useState } from "react";
import {
	Action,
	ActionPanel,
	Icon,
	List,
	useNavigation,
	showToast,
	Toast,
} from "@vicinae/api";
import type { Chat } from "./types";
import {
	createNewChat,
	loadAllChats,
	deleteChat,
	loadChat,
	subscribeChats,
} from "./services/chatStorage";
import { ChatView } from "./components/ChatView";
import { COLORS, EMOJIS } from "./constants";
import { formatTimestamp } from "./utils/formatting";

/**
 * CHAT LIST COMMAND - Browse saved conversations
 */
export default function ChatListCommand() {
	const [chats, setChats] = useState<Chat[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const { push } = useNavigation();

	// Load chats on mount and refresh on storage changes
	React.useEffect(() => {
		const load = () => {
			const loadedChats = loadAllChats();
			setChats(loadedChats);
			setIsLoading(false);
		};

		load();
		const unsubscribe = subscribeChats(load);
		return () => unsubscribe();
	}, []);

	const handleOpenChat = (chatId: string) => {
		const chat = loadChat(chatId);
		if (chat) {
			push(<ChatView chat={chat} />);
		}
	};

	const handleDeleteChat = (chatId: string) => {
		const success = deleteChat(chatId);
		if (success) {
			setChats(chats.filter((c) => c.id !== chatId));
			showToast({
				style: Toast.Style.Success,
				title: `${EMOJIS.TRASH} Chat Deleted`,
				message: "Chat has been removed from history",
			});
		}
	};

	const handleNewChat = () => {
		const newChat = createNewChat();
		push(<ChatView chat={newChat} />);
	};

	return (
		<List
			isLoading={isLoading}
			searchBarPlaceholder="Search conversations..."
		>
			{chats.length === 0 ? (
				<List.Section title={`${EMOJIS.SCROLL} Chat History`}>
					<List.Item
						title="No conversations yet"
						subtitle="Start a new chat to begin"
						icon={{ source: Icon.Bubble, tintColor: COLORS.MUTED }}
						actions={
							<ActionPanel>
								<Action
									title="New Chat"
									icon={Icon.Plus}
									onAction={handleNewChat}
									shortcut={{ modifiers: ["cmd"], key: "n" }}
								/>
							</ActionPanel>
						}
					/>
				</List.Section>
			) : (
				<List.Section
					title={`${EMOJIS.SCROLL} Chat History (${chats.length} total)`}
				>
					{chats.map((chat) => {
						const messageCount = chat.messages.length;
						const lastMessage = chat.messages[chat.messages.length - 1];
						const preview = lastMessage
							? lastMessage.content.substring(0, 60) +
								(lastMessage.content.length > 60 ? "..." : "")
							: "Empty conversation";

						return (
							<List.Item
								key={chat.id}
								title={chat.title}
								subtitle={preview}
								icon={{ source: Icon.Bubble, tintColor: COLORS.CLAUDE }}
								accessories={[
									{ text: `${messageCount} msgs`, icon: Icon.Message },
									{ text: formatTimestamp(chat.updatedAt), icon: Icon.Clock },
								]}
								actions={
									<ActionPanel>
										<Action
											title="Open Chat"
											icon={Icon.Message}
											onAction={() => handleOpenChat(chat.id)}
										/>
										<Action
											title="New Chat"
											icon={Icon.Plus}
											onAction={handleNewChat}
											shortcut="new"
										/>
										<Action
											title="Delete Chat"
											icon={Icon.Trash}
											style="destructive"
											onAction={() => handleDeleteChat(chat.id)}
											shortcut="remove"
										/>
									</ActionPanel>
								}
							/>
						);
					})}
				</List.Section>
			)}
		</List>
	);
}
