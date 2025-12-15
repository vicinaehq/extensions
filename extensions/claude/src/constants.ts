/**
 * Application constants for Claude Chat Extension
 */

// Theme Colors
export const COLORS = {
	CLAUDE: "#7C3AED", // Purple for Claude/AI
	USER: "#3B82F6", // Blue for user
	ACTION: "#10B981", // Green for actions
	MUTED: "#9CA3AF", // Gray for empty states
} as const;

// Emojis
export const EMOJIS = {
	ROCKET: "🚀",
	SCROLL: "📜",
	YOU: "👤",
	CLAUDE: "🤖",
	CHAT: "💬",
	PENCIL: "✍️",
	SEND: "📤",
	SPARKLES: "✨",
	LIGHTNING: "⚡",
	CLOCK: "🕒",
	TRASH: "🗑️",
	CHECK: "✅",
	CROSS: "❌",
} as const;

// Default Values
export const DEFAULTS = {
	MODEL: "claude-haiku-4-5",
	MAX_TOKENS: 4096,
	RECENT_MESSAGES_LIMIT: 5,
	MESSAGE_PREVIEW_LENGTH: 60,
} as const;

// UI Text
export const UI_TEXT = {
	NEW_CHAT_TITLE: "Start New Chat",
	NEW_CHAT_SUBTITLE: "Begin a conversation with Claude AI",
	RECENT_MESSAGES_TITLE: "Recent Messages",
	CONVERSATION_TITLE: "Conversation",
	ACTIONS_TITLE: "Actions",
	SEND_MESSAGE_TITLE: "Send New Message",
	SEND_MESSAGE_SUBTITLE: "Ask Claude anything...",
	NO_MESSAGES: "No messages yet",
	NO_MESSAGES_SUBTITLE: "Send a message to start chatting with Claude",
	WAITING_PLACEHOLDER: "Waiting for Claude's response...",
	SEARCH_PLACEHOLDER: "Search conversation...",
	MESSAGE_PLACEHOLDER:
		"Ask Claude anything... (coding, writing, analysis, etc.)",
	YOUR_MESSAGE_LABEL: "Your Message",
	TIPS_TITLE: "Tips",
	TIPS_TEXT:
		"Be specific and clear for best results\nPress Shift+Enter to send quickly",
} as const;

// Toast Messages
export const TOAST_MESSAGES = {
	EMPTY_MESSAGE: {
		title: "Empty Message",
		message: "Please enter a message to send",
	},
	API_KEY_MISSING: {
		title: "API Key Missing",
		message: "Please set your Anthropic API key in extension preferences",
	},
	RESPONSE_RECEIVED: {
		title: "Response Received",
	},
	ERROR: {
		title: "Error",
	},
	CHAT_CLEARED: {
		title: "Chat Cleared",
		message: "Starting fresh!",
	},
} as const;

// Action Labels
export const ACTIONS = {
	NEW_CHAT: "New Chat",
	SEND_MESSAGE: "Send Message",
	COPY_MESSAGE: "Copy Message",
	COPY_ALL: "Copy All Messages",
	CLEAR_CHAT: "Clear Chat",
	BACK_TO_MAIN: "Back to Main",
	CANCEL: "Cancel",
} as const;
