/**
 * Type definitions for Claude Chat Extension
 */

export interface Preferences {
	apiKey: string;
	model: string;
	maxTokens: string;
	enableStreaming: boolean;
}

export interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: Date;
}

export interface Chat {
	id: string;
	title: string;
	messages: Message[];
	createdAt: Date;
	updatedAt: Date;
}
