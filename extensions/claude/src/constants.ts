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
    SEND: "📤",
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
