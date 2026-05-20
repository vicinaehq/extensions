/**
 * Chat view component with List-based architecture
 * Uses List to display messages and searchBar as input field to prevent flickering
 */

import React, { useCallback, useMemo, useState } from "react";
import { Action, ActionPanel, Icon, List, useNavigation } from "@vicinae/api";
import type { Chat, Message } from "../types";
import { useChat } from "../hooks/useChat";
import { COLORS, EMOJIS } from "../constants";
import { formatTimestamp } from "../utils/formatting";
import { getMessageRoleInfo } from "../utils/messages";

/**
 * Chat view - List-based conversation interface with searchBar as input
 */
export function ChatView({ chat: initialChat }: { chat: Chat }) {
	const { chat, isLoading, streamingMessage, sendMessage } =
		useChat(initialChat);
	const { pop } = useNavigation();
	const [inputMessage, setInputMessage] = useState("");

	const handleSendMessage = useCallback(async () => {
		if (!inputMessage.trim() || isLoading) return;
		const message = inputMessage;
		setInputMessage("");
		await sendMessage(message);
	}, [inputMessage, isLoading, sendMessage]);

	const copyAllText = useMemo(
		() =>
			chat.messages
				.map((m) => {
					const { name } = getMessageRoleInfo(m.role);
					return `${name}: ${m.content}`;
				})
				.join("\n\n"),
		[chat.messages],
	);

	const GlobalActions = (
		<>
			<Action
				title="Send Message"
				icon={Icon.Message}
				onAction={handleSendMessage}
				shortcut={{ modifiers: [], key: "enter" }}
			/>
			<Action.CopyToClipboard
				title="Copy All Messages"
				content={copyAllText}
				shortcut={{ modifiers: ["ctrl", "shift"], key: "c" }}
				icon={Icon.CopyClipboard}
			/>
		</>
	);

	const MessageItem = useCallback(
		({ msg }: { msg: Message }) => {
			const { icon, name, tintColor, listIcon } = getMessageRoleInfo(msg.role);
			const preview =
				msg.content.length > 100
					? `${msg.content.substring(0, 100)}...`
					: msg.content;
			const formattedTime = formatTimestamp(msg.timestamp);

			return (
				<List.Item
					key={msg.id}
					title={`${icon} ${name}`}
					subtitle={preview}
					icon={{ source: listIcon, tintColor }}
					accessories={[{ text: formattedTime, icon: Icon.Clock }]}
					detail={
						<List.Item.Detail
							markdown={`# ${icon} ${name}\n\n${msg.content}\n\n---\n*${formattedTime}*`}
						/>
					}
					actions={
						<ActionPanel>
							{GlobalActions}
							<Action.CopyToClipboard
								title="Copy This Message"
								content={msg.content}
								shortcut={{ modifiers: ["ctrl"], key: "c" }}
								icon={Icon.CopyClipboard}
							/>
						</ActionPanel>
					}
				/>
			);
		},
		[handleSendMessage, pop, copyAllText],
	);

	return (
		<List
			isLoading={isLoading && streamingMessage === null}
			navigationTitle={chat.title}
			searchText={inputMessage}
			onSearchTextChange={setInputMessage}
			searchBarPlaceholder="Type your message here... (and hit Enter)"
			filtering={false}
			isShowingDetail={true}
		>
			<List.Section
				title={`${EMOJIS.CHAT} Conversation (${chat.messages.length} messages)`}
			>
				{chat.messages.length === 0 && !streamingMessage && (
					<List.Item
						title="No messages yet"
						subtitle="Type your message in the search bar above and press Enter to send"
						icon={{ source: Icon.Bubble, tintColor: COLORS.MUTED }}
						actions={<ActionPanel>{GlobalActions}</ActionPanel>}
					/>
				)}

				{chat.messages.map((msg) => (
					<MessageItem key={msg.id} msg={msg} />
				))}

				{streamingMessage !== null && (
					<List.Item
						id="streaming-message"
						title={`${EMOJIS.CLAUDE} Claude is responding...`}
						subtitle={streamingMessage || "Thinking..."}
						icon={{ source: Icon.SpeechBubble, tintColor: COLORS.CLAUDE }}
						accessories={[{ text: "Streaming...", icon: Icon.Clock }]}
						detail={
							<List.Item.Detail
								markdown={`# ${EMOJIS.CLAUDE} Claude\n\n${streamingMessage || "Thinking..."}`}
							/>
						}
					/>
				)}
			</List.Section>
		</List>
	);
}
