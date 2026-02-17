/**
 * Claude API Service
 * Handles all communication with Anthropic's Claude API using the official SDK
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "../types";
import { DEFAULTS } from "../constants";

/**
 * Produce a detailed, user-friendly error string from Anthropic SDK/network errors
 */
export function describeError(err: unknown): string {
	const e = err as any;
	const detail = e?.error?.message ?? e?.message ?? "Unknown error";
	const type = e?.error?.type ?? e?.type;

	const hints: Record<string, string> = {
		authentication_error: " (check API key)",
		invalid_request_error: " (invalid request parameters)",
		rate_limit_error: " (rate limited; try again later)",
		api_error: " (server error)",
	};

	const parts = [
		e?.name,
		e?.status && `status ${e.status}`,
		e?.code && `code ${e.code}`,
	].filter(Boolean);

	const header = parts.length ? parts.join(" / ") : "Request failed";
	return `${header}: ${detail}${hints[type] ?? ""}`;
}

interface SendMessageParams {
	apiKey: string;
	messages: Message[];
	model?: string;
	maxTokens?: number;
}

interface SendMessageResponse {
	content: string;
	success: boolean;
	error?: string;
}

interface StreamMessageParams extends SendMessageParams {
	onUpdate: (text: string) => void;
}

/**
 * Helper to initialize Anthropic client and map messages
 */
function getClientAndMessages(params: SendMessageParams) {
	const { apiKey, messages } = params;
	const anthropic = new Anthropic({ apiKey });
	const apiMessages = messages.map((msg) => ({
		role: msg.role as "user" | "assistant",
		content: msg.content,
	}));
	return { anthropic, apiMessages };
}

/**
 * Extract text from Anthropic response content blocks
 */
function extractText(content: Anthropic.Message["content"]): string {
	const block = content.find((b) => b.type === "text");
	return block?.type === "text" ? block.text : "";
}

/**
 * Send a message to Claude with streaming support
 */
export async function streamMessageToClaude(
	params: StreamMessageParams,
): Promise<SendMessageResponse> {
	try {
		const { anthropic, apiMessages } = getClientAndMessages(params);
		let fullText = "";

		const stream = anthropic.messages.stream({
			model: params.model || DEFAULTS.MODEL,
			max_tokens: params.maxTokens || DEFAULTS.MAX_TOKENS,
			messages: apiMessages,
		});

		stream.on("text", (text: string) => {
			fullText += text;
			params.onUpdate(fullText);
		});

		const finalMessage = await stream.finalMessage();
		const content = extractText(finalMessage.content);

		return {
			content: content || fullText,
			success: !!(content || fullText),
			error: content || fullText ? undefined : "No text content in response",
		};
	} catch (error) {
		return { content: "", success: false, error: describeError(error) };
	}
}

/**
 * Send a message to Claude and get a response (non-streaming)
 */
export async function sendMessageToClaude(
	params: SendMessageParams,
): Promise<SendMessageResponse> {
	try {
		const { anthropic, apiMessages } = getClientAndMessages(params);
		const response = await anthropic.messages.create({
			model: params.model || DEFAULTS.MODEL,
			max_tokens: params.maxTokens || DEFAULTS.MAX_TOKENS,
			messages: apiMessages,
		});

		const content = extractText(response.content);
		return content
			? { content, success: true }
			: { content: "", success: false, error: "No text content in response" };
	} catch (error) {
		return { content: "", success: false, error: describeError(error) };
	}
}

/**
 * Generate a concise title for a conversation
 */
export async function generateChatTitleAI(
	apiKey: string,
	messages: Message[],
	model: string = DEFAULTS.MODEL,
): Promise<string | null> {
	try {
		const { content, success } = await sendMessageToClaude({
			apiKey,
			model,
			maxTokens: 50,
			messages: [
				...messages,
				{
					id: "title-gen",
					role: "user",
					content:
						"Generate a very short, concise title (max 5-6 words) for this conversation based on the messages above. Respond ONLY with the title text, no quotes or additional explanation.",
					timestamp: new Date(),
				},
			],
		});

		return success ? content.trim().replace(/^["']|["']$/g, "") : null;
	} catch (error) {
		console.error("Failed to generate AI title:", error);
		return null;
	}
}
