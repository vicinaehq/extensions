import { assertOk, sseEvents } from "./sse.ts";
import { type Provider, ProviderError, requireKey, withTimeout } from "./types.ts";

/** Maps one streamGenerateContent chunk to answer text, or throws when the answer was blocked. */
export function geminiChunk(data: string): string | undefined {
	const chunk = JSON.parse(data);
	if (chunk.error) throw new ProviderError(`Gemini API: ${chunk.error.message}`);
	if (chunk.promptFeedback?.blockReason) throw new ProviderError(`Gemini blocked this question (${chunk.promptFeedback.blockReason}).`);
	const parts: { text?: string; thought?: boolean }[] = chunk.candidates?.[0]?.content?.parts ?? [];
	return parts.filter((p) => !p.thought && p.text).map((p) => p.text).join("") || undefined;
}

export const gemini: Provider = {
	id: "gemini",
	title: "Gemini API",
	async stream(messages, opts) {
		const model = encodeURIComponent(opts.model || "gemini-3.8-flash");
		const key = requireKey(opts, "Gemini API", "API Key");
		await withTimeout(
			opts.signal,
			async (signal) => {
				const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
					method: "POST",
					headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
					body: JSON.stringify({
						systemInstruction: { parts: [{ text: opts.systemPrompt }] },
						contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
					}),
					signal,
				});
				await assertOk(res, "Gemini API");
				for await (const { data } of sseEvents(res.body!)) {
					const text = geminiChunk(data);
					if (text) opts.onDelta(text);
				}
			},
			"Gemini API",
		);
	},
};
