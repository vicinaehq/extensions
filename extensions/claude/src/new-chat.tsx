/**
 * New Chat Command - Start a fresh conversation with Claude
 */

import React, { useState } from "react";
import { Icon, List, useNavigation } from "@vicinae/api";
import type { Chat } from "./types";
import { createNewChat } from "./services/chatStorage";
import { ChatView } from "./components/ChatView";
import { COLORS } from "./constants";

/**
 * NEW CHAT COMMAND - Start a fresh conversation
 */
export default function NewChatCommand() {
	const [currentChat] = useState<Chat>(createNewChat());
	const { push } = useNavigation();

	// Immediately open the chat view
	React.useEffect(() => {
		push(<ChatView chat={currentChat} />);
	}, []);

	return (
		<List>
			<List.Item
				title="Starting new chat..."
				icon={{ source: Icon.Message, tintColor: COLORS.CLAUDE }}
			/>
		</List>
	);
}
