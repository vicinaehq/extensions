import { assertOk, sseEvents } from "./sse.ts";
import { type Provider, ProviderError, requireKey, withTimeout } from "./types.ts";

/** Maps one Responses API stream event to answer text, or throws on failure. */
export function openaiEvent(data: string): string | undefined {
	// OpenAI-compatible gateways end the stream with a "[DONE]" sentinel.
	if (data.trim() === "[DONE]") return undefined;
	const event = JSON.parse(data);
	if (event.type === "response.output_text.delta") return event.delta;
	if (event.type === "error") throw new ProviderError(`OpenAI API: ${event.error?.message ?? event.message ?? "error"}`);
	if (event.type === "response.failed") throw new ProviderError(`OpenAI API: ${event.response?.error?.message ?? "failed"}`);
}

export const openai: Provider = {
	id: "openai",
	title: "OpenAI API",
	async stream(messages, opts) {
		// A gateway URL may be given with or without its trailing /v1.
		const base = opts.baseUrl?.trim().replace(/\/+$/, "").replace(/\/v1$/, "") || "https://api.openai.com";
		const key = requireKey(opts, "OpenAI API", "API Key");
		await withTimeout(
			opts.signal,
			async (signal) => {
				const res = await fetch(`${base}/v1/responses`, {
					method: "POST",
					headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
					body: JSON.stringify({
						model: opts.model || "gpt-5.5",
						instructions: opts.systemPrompt,
						input: messages.map((m) => ({ role: m.role, content: m.content })),
						stream: true,
						store: false,
					}),
					signal,
				});
				await assertOk(res, "OpenAI API");
				for await (const { data } of sseEvents(res.body!)) {
					const text = openaiEvent(data);
					if (text) opts.onDelta(text);
				}
			},
			"OpenAI API",
		);
	},
};
