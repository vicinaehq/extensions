/**
 * Chat view component with List-based architecture
 * Uses List to display messages and searchBar as input field to prevent flickering
 */

import React, { useState, useCallback, useMemo } from "react";
import { Action, ActionPanel, List, Icon, useNavigation } from "@vicinae/api";
import type { Chat } from "../types";
import { useChat } from "../hooks/useChat";
import { COLORS, EMOJIS } from "../constants";
import { formatTimestamp } from "../utils/formatting";

/**
 * Chat view - List-based conversation interface with searchBar as input
 * Optimized to prevent flickering when typing by memoizing message rendering
 */
export function ChatView({ chat: initialChat }: { chat: Chat }) {
	const { chat, isLoading, streamingMessage, sendMessage } =
		useChat(initialChat);
	const { pop } = useNavigation();
	const [inputMessage, setInputMessage] = useState("");

	// Memoize handleSendMessage to prevent ActionPanel re-renders
	const handleSendMessage = useCallback(async () => {
		if (!inputMessage.trim() || isLoading) return;
		const message = inputMessage;
		setInputMessage("");
		await sendMessage(message);
	}, [inputMessage, isLoading, sendMessage]);

	const copyAllText = useMemo(
		() =>
			chat.messages
				.map((m) => `${m.role === "user" ? "You" : "Claude"}: ${m.content}`)
				.join("\n\n"),
		[chat.messages],
	);

	const Actions = (
		<ActionPanel>
			<Action
				title={`${EMOJIS.SEND} Send Message`}
				icon={Icon.Message}
				onAction={handleSendMessage}
				shortcut={{ modifiers: ["shift"], key: "enter" }}
			/>
			<Action.CopyToClipboard
				title="Copy All Messages"
				content={copyAllText}
				shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
				icon={Icon.CopyClipboard}
			/>
			<Action
				title="Back to Chat List"
				icon={Icon.ArrowLeft}
				onAction={pop}
				shortcut={{ modifiers: ["cmd"], key: "b" }}
			/>
		</ActionPanel>
	);

	// Memoize message items to prevent re-rendering when typing
	const messageItems = useMemo(() => {
		return chat.messages.map((msg) => {
			const roleIcon = msg.role === "user" ? EMOJIS.YOU : EMOJIS.CLAUDE;
			const roleName = msg.role === "user" ? "You" : "Claude";
			const isUser = msg.role === "user";
			const preview =
				msg.content.length > 100
					? `${msg.content.substring(0, 100)}...`
					: msg.content;

			return (
				<List.Item
					key={msg.id}
					title={`${roleIcon} ${roleName}`}
					subtitle={preview}
					icon={{
						source: isUser ? Icon.Person : Icon.SpeechBubble,
						tintColor: isUser ? COLORS.USER : COLORS.CLAUDE,
					}}
					accessories={[
						{ text: formatTimestamp(msg.timestamp), icon: Icon.Clock },
					]}
					detail={
						<List.Item.Detail
							markdown={`# ${roleIcon} ${roleName}\n\n${msg.content}\n\n---\n*${formatTimestamp(msg.timestamp)}*`}
						/>
					}
					actions={
						<ActionPanel>
							<Action
								title={`${EMOJIS.SEND} Send Message`}
								icon={Icon.Message}
								onAction={handleSendMessage}
								shortcut={{ modifiers: ["shift"], key: "enter" }}
							/>
							<Action.CopyToClipboard
								title="Copy This Message"
								content={msg.content}
								shortcut={{ modifiers: ["cmd"], key: "c" }}
								icon={Icon.CopyClipboard}
							/>
							{Actions}
						</ActionPanel>
					}
				/>
			);
		});
	}, [chat.messages, handleSendMessage, pop]);

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
			{/* Messages Section */}
			<List.Section
				title={`${EMOJIS.CHAT} Conversation (${chat.messages.length} messages)`}
			>
				{chat.messages.length === 0 && !streamingMessage && (
					<List.Item
						title="No messages yet"
						subtitle="Type your message in the search bar above and press Enter to send"
						icon={{ source: Icon.Bubble, tintColor: COLORS.MUTED }}
						actions={Actions}
					/>
				)}

				{/* Render memoized message items */}
				{messageItems}

				{/* Display streaming message if in progress */}
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
