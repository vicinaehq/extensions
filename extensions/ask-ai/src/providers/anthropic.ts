import Anthropic from "@anthropic-ai/sdk";
import { type Provider, ProviderError, requireKey } from "./types.ts";

export const anthropic: Provider = {
	id: "anthropic",
	title: "Claude API",
	async stream(messages, opts) {
		const key = requireKey(opts, "Claude API", "API Key");
		// The SDK appends /v1/messages itself, so a gateway URL ending in /v1 would double it.
		const baseURL = opts.baseUrl?.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
		const timeout = 300_000;
		const client = baseURL
			? new Anthropic({ baseURL, apiKey: null, authToken: key, timeout })
			: new Anthropic({ apiKey: key, timeout });
		try {
			const stream = client.beta.messages.stream(
				{
					model: opts.model || "claude-opus-5-5",
					max_tokens: 64000,
					system: opts.systemPrompt,
					messages,
					output_config: { effort: "low" },
					// Anthropic-only: re-runs a safety-declined request on the recommended fallback model.
					// Not sent to gateways, which may reject fields they don't know.
					...(baseURL ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
				},
				{ signal: opts.signal },
			);
			for await (const event of stream) {
				if (event.type === "content_block_delta" && event.delta.type === "text_delta") opts.onDelta(event.delta.text);
			}
			const final = await stream.finalMessage();
			if (final.stop_reason === "refusal") throw new ProviderError("Claude declined to answer this one.");
		} catch (err) {
			if (err instanceof Anthropic.APIUserAbortError) throw new DOMException("Aborted", "AbortError");
			if (err instanceof Anthropic.AuthenticationError) {
				throw new ProviderError("The Claude API key was rejected. Check **API Key** in Ask AI Settings (Ctrl+,).");
			}
			if (err instanceof Anthropic.RateLimitError) throw new ProviderError("Anthropic API: rate limited. Try again in a moment.");
			if (err instanceof Anthropic.APIError) throw new ProviderError(`Anthropic API ${err.status ?? ""}: ${err.message}`);
			throw err;
		}
	},
};
