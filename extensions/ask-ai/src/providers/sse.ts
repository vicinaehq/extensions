import { ProviderError } from "./types.ts";

export type SseEvent = { event?: string; data: string };

/** Parses a server-sent events body into events. */
export async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
	const decoder = new TextDecoder();
	let buffer = "";
	let event: string | undefined;
	let data: string[] = [];
	for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
		buffer += decoder.decode(chunk, { stream: true });
		let newline = buffer.indexOf("\n");
		while (newline !== -1) {
			const line = buffer.slice(0, newline).replace(/\r$/, "");
			buffer = buffer.slice(newline + 1);
			if (line === "") {
				if (data.length) yield { event, data: data.join("\n") };
				event = undefined;
				data = [];
			} else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
			else if (line.startsWith("event:")) event = line.slice(6).trim();
			newline = buffer.indexOf("\n");
		}
	}
	const last = buffer.replace(/\r$/, "");
	if (last.startsWith("data:")) data.push(last.slice(5).trimStart());
	if (data.length) yield { event, data: data.join("\n") };
}

/** Throws a readable error for a non-2xx HTTP response. */
export async function assertOk(res: Response, provider: string): Promise<void> {
	if (res.ok) return;
	const body = await res.text().catch(() => "");
	let message = body;
	try {
		const json = JSON.parse(body);
		message = json.error?.message ?? json[0]?.error?.message ?? body;
	} catch {}
	const hint =
		res.status === 401 || res.status === 403
			? " Check the API key in Ask AI Settings (Ctrl+,)."
			: res.status === 429
				? " Rate limited or out of credit."
				: "";
	throw new ProviderError(`${provider} returned ${res.status}: ${message.slice(0, 500)}${hint}`);
}
