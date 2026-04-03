import { DEFAULT_OLLAMA_HOST, LANGUAGES } from "../constants";
import type { OllamaModel } from "../types";

export async function fetchOllamaModels(
	host: string = DEFAULT_OLLAMA_HOST,
): Promise<OllamaModel[]> {
	try {
		const response = await fetch(`${host}/api/tags`);
		if (!response.ok) throw new Error("Failed to fetch models");
		const data = await response.json();
		return data.models || [];
	} catch {
		return [];
	}
}

export function getLangName(code: string): string {
	if (code === "auto") return "the detected language";
	const lang = LANGUAGES.find((l) => l.value === code);
	return lang?.title || code;
}

export async function translateText(
	text: string,
	sourceLang: string,
	targetLang: string,
	model: string,
	host: string = DEFAULT_OLLAMA_HOST,
	signal?: AbortSignal,
): Promise<string> {
	if (!text?.trim()) throw new Error("Text cannot be empty");

	const sourceName = getLangName(sourceLang);
	const targetName = getLangName(targetLang);

	const prompt = `You are a professional ${sourceName} (${sourceLang}) to ${targetName} (${targetLang}) translator. Your goal is to accurately convey the meaning and nuances of the original ${sourceName} text while adhering to ${targetName} grammar, vocabulary, and cultural sensitivities.
Produce only the ${targetName} translation, without any additional explanations or commentary. Please translate the following ${sourceName} text into ${targetName}:


${text}`;

	try {
		const response = await fetch(`${host}/api/generate`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: model,
				prompt: prompt,
				stream: false,
				options: {
					temperature: 0.3,
					top_p: 0.95,
					top_k: 40,
					num_predict: 2048,
					repeat_penalty: 1.1,
				},
			}),
			signal,
		});

		if (!response.ok) {
			throw new Error(
				`Ollama error: ${response.status} ${response.statusText}`,
			);
		}

		const data = await response.json();
		const translated = data.response?.trim();

		if (!translated) throw new Error("Empty translation received from model");

		return translated;
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			throw error;
		}
		console.error("Translation error:", error);
		throw error instanceof Error
			? error
			: new Error("Failed to translate text");
	}
}
