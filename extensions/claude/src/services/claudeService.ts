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
	const parts: string[] = [];
	if (e?.name) parts.push(String(e.name));
	if (e?.status) parts.push(`status ${e.status}`);
	if (e?.code) parts.push(`code ${e.code}`);
	const header = parts.length ? parts.join(" / ") : "Request failed";

	// Anthropic API errors often nest message under error.message
	const detail = e?.error?.message ?? e?.message ?? "Unknown error";

	// Provide concise hinting for common cases
	const type = e?.error?.type ?? e?.type;

	let hint = "";
	switch (type) {
		case "authentication_error":
			hint = " (check API key)";
			break;
		case "invalid_request_error":
			hint = " (invalid request parameters)";
			break;
		case "rate_limit_error":
			hint = " (rate limited; try again later)";
			break;
		case "api_error":
			hint = " (server error)";
			break;
	}

	return `${header}: ${detail}${hint}`;
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
 * Send a message to Claude with streaming support
 * Calls onUpdate callback with accumulated text as it arrives
 */
export async function streamMessageToClaude(
	params: StreamMessageParams,
): Promise<SendMessageResponse> {
	const {
		apiKey,
		messages,
		model = DEFAULTS.MODEL,
		maxTokens = DEFAULTS.MAX_TOKENS,
		onUpdate,
	} = params;

	try {
		const anthropic = new Anthropic({ apiKey });

		// Convert our Message format to Anthropic's expected format
		const apiMessages = messages.map((msg) => ({
			role: msg.role,
			content: msg.content,
		}));

		let fullText = "";

		const stream = anthropic.messages.stream({
			model,
			max_tokens: maxTokens,
			messages: apiMessages,
		});

		// Handle streaming events
		stream.on("text", (text: string) => {
			fullText += text;
			onUpdate(fullText);
		});

		// Wait for stream to complete
		const finalMessage = await stream.finalMessage();

		// Extract final text content
		const textContent = finalMessage.content.find(
			(block) => block.type === "text",
		);

		if (!textContent || textContent.type !== "text") {
			return {
				content: fullText || "",
				success: fullText.length > 0,
				error: fullText.length > 0 ? undefined : "No text content in response",
			};
		}

		return {
			content: textContent.text,
			success: true,
		};
	} catch (error) {
		return {
			content: "",
			success: false,
			error: describeError(error),
		};
	}
}

/**
 * Send a message to Claude and get a response (non-streaming)
 */
export async function sendMessageToClaude(
	params: SendMessageParams,
): Promise<SendMessageResponse> {
	const {
		apiKey,
		messages,
		model = DEFAULTS.MODEL,
		maxTokens = DEFAULTS.MAX_TOKENS,
	} = params;

	try {
		const anthropic = new Anthropic({ apiKey });

		// Convert our Message format to Anthropic's expected format
		const apiMessages = messages.map((msg) => ({
			role: msg.role,
			content: msg.content,
		}));

		const response = await anthropic.messages.create({
			model,
			max_tokens: maxTokens,
			messages: apiMessages,
		});

		// Extract text content from the response
		const textContent = response.content.find((block) => block.type === "text");

		if (!textContent || textContent.type !== "text") {
			return {
				content: "",
				success: false,
				error: "No text content in response",
			};
		}

		return {
			content: textContent.text,
			success: true,
		};
	} catch (error) {
		return {
			content: "",
			success: false,
			error: describeError(error),
		};
	}
}
