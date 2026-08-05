import { getPreferenceValues } from "@vicinae/api";
import { COMMAND_PROMPTS, GLOBAL_PROMPT, ROLE_PROMPTS } from "../config/prompts";
import type {
	ChatMessage,
	EnhanceStyle,
	ExtensionPreferences,
	Mode,
	OllamaModel,
} from "../types/index";
import { ENHANCE_STYLE_DEFINITIONS } from "../utils/index";

interface OllamaChatResponse {
	message: { role: string; content: string };
	done: boolean;
}

interface OllamaErrorResponse {
	error: string;
}

function getBaseUrl(): string {
	const prefs = getPreferenceValues<ExtensionPreferences>();
	return prefs.ollamaUrl.replace(/\/$/, "");
}

async function parseApiError(response: Response): Promise<string> {
	try {
		const errJson = (await response.json()) as OllamaErrorResponse;
		return errJson.error;
	} catch {
		return await response.text();
	}
}

export async function fetchModels(): Promise<OllamaModel[]> {
	const baseUrl = getBaseUrl();
	const response = await fetch(`${baseUrl}/api/tags`);

	if (!response.ok) {
		throw new Error(
			`Failed to fetch models: ${response.status} ${response.statusText}`,
		);
	}

	const data = await response.json();
	return data.models as OllamaModel[];
}

export function buildMessages(
	mode: Mode,
	input: string,
	targetLanguage: string,
	enhanceStyle?: EnhanceStyle,
): ChatMessage[] {
	const tag = mode.toUpperCase();
	const langInstruction =
		mode === "translate"
			? `Target language: ${targetLanguage}.`
			: mode === "dictionary"
				? `The user's target language is ${targetLanguage}.`
				: `Respond in this language: ${targetLanguage}.`;

	let commandPrompt = COMMAND_PROMPTS[mode];
	if (mode === "enhance" && enhanceStyle) {
		const styleDef = ENHANCE_STYLE_DEFINITIONS[enhanceStyle];
		commandPrompt = commandPrompt
			.replace("{styleDefinition}", styleDef);
	}

	const systemPrompt =
		`${GLOBAL_PROMPT}\n\n[MODE: ${mode}]\n${ROLE_PROMPTS[mode]}\n\n${commandPrompt}\n\n${langInstruction}`;
	const userContent = `<${tag}>\n${input}\n</${tag}>`;

	return [
		{ role: "system", content: systemPrompt },
		{ role: "user", content: userContent },
	];
}

async function apiChat(
	model: string,
	messages: ChatMessage[],
	stream: boolean,
	signal?: AbortSignal,
): Promise<Response> {
	const baseUrl = getBaseUrl();
	return fetch(`${baseUrl}/api/chat`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ model, messages, stream }),
		signal,
	});
}

export async function* streamChat(
	model: string,
	messages: ChatMessage[],
	signal?: AbortSignal,
): AsyncGenerator<string, void, unknown> {
	const response = await apiChat(model, messages, true, signal);

	if (!response.ok) {
		throw new Error(
			`Ollama API error (${response.status}): ${await parseApiError(response)}`,
		);
	}

	const reader = response.body?.getReader();
	if (!reader) {
		throw new Error("Response body is not readable");
	}

	const decoder = new TextDecoder();
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";

			for (const line of lines) {
				if (!line.trim()) continue;
				try {
					const parsed = JSON.parse(line) as OllamaChatResponse;
					if (parsed.message?.content) {
						yield parsed.message.content;
					}
					if (parsed.done) {
						return;
					}
				} catch {}
			}
		}
	} finally {
		reader.releaseLock();
	}
}
