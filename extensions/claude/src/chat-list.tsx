/**
 * Chat List Command - Browse and manage saved conversations
 */

import React from "react";
import {
	Action,
	ActionPanel,
	Icon,
	List,
	showToast,
	Toast,
	useNavigation,
} from "@vicinae/api";
import { useChatHistory } from "./hooks/useChatHistory";
import { ChatView } from "./components/ChatView";
import { COLORS, EMOJIS } from "./constants";
import { formatTimestamp } from "./utils/formatting";

/**
 * CHAT LIST COMMAND - Browse saved conversations
 */
export default function ChatListCommand() {
	const { chats, isLoading, deleteChat, createNewChat, loadChat } =
		useChatHistory();
	const { push } = useNavigation();

	const handleOpenChat = (chatId: string) => {
		const chat = loadChat(chatId);
		if (chat) {
			push(<ChatView chat={chat} />);
		}
	};

	const handleDeleteChat = (chatId: string) => {
		if (deleteChat(chatId)) {
			showToast({
				style: Toast.Style.Success,
				title: `${EMOJIS.TRASH} Chat Deleted`,
				message: "Chat has been removed from history",
			});
		}
	};

	const handleNewChat = () => {
		push(<ChatView chat={createNewChat()} />);
	};

	return (
		<List isLoading={isLoading} searchBarPlaceholder="Search conversations...">
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
									shortcut="new"
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

						return (
							<List.Item
								key={chat.id + chat.title + chat.updatedAt.getTime()}
								title={chat.title}
								icon={{
									source: Icon.Bubble,
									tintColor: COLORS.CLAUDE,
								}}
								accessories={[
									{
										text: `${messageCount} msgs`,
										icon: Icon.Message,
									},
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
