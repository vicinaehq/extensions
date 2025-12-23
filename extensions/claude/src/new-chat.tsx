/**
 * New Chat Command - Start a fresh conversation with Claude
 */

import React, { useEffect } from "react";
import { useNavigation } from "@vicinae/api";
import { createNewChat } from "./services/chatStorage";
import { ChatView } from "./components/ChatView";
import ChatListCommand from "./chat-list";

/**
 * NEW CHAT COMMAND - Start a fresh conversation
 */
export default function NewChatCommand() {
	const { push } = useNavigation();

	// Immediately open the chat view
	useEffect(() => {
		push(<ChatView chat={createNewChat()} />);
	}, []);

	// Render chat history underneath so going "back" lands on history
	return <ChatListCommand />;
}
