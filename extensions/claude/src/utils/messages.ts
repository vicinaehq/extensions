import { Icon } from "@vicinae/api";
import { COLORS, EMOJIS } from "../constants";
import type { Message } from "../types";

/**
 * Get display info for a message role
 */
export function getMessageRoleInfo(role: Message["role"]) {
	const isUser = role === "user";
	return {
		icon: isUser ? EMOJIS.YOU : EMOJIS.CLAUDE,
		name: isUser ? "You" : "Claude",
		tintColor: isUser ? COLORS.USER : COLORS.CLAUDE,
		listIcon: isUser ? Icon.Person : Icon.SpeechBubble,
	};
}

/**
 * Generate a unique message ID
 */
export function generateMessageId() {
	return (
		(globalThis.crypto?.randomUUID?.() as string | undefined) ??
		`msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
	);
}

/**
 * Create a new message object
 */
export function createMessage(role: Message["role"], content: string): Message {
	return {
		id: generateMessageId(),
		role,
		content,
		timestamp: new Date(),
	};
}
