/**
 * New Chat Command - Start a fresh conversation with Claude
 */

import React from "react";
import { ChatStorage } from "./services/chatStorage";
import { ChatView } from "./components/ChatView";

/**
 * NEW CHAT COMMAND - Start a fresh conversation
 */
export default function NewChatCommand() {
	return <ChatView chat={ChatStorage.createNewChat()} />;
}
