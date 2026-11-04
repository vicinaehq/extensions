export type Role = "user" | "assistant";

export type Message = { role: Role; content: string };

export type ProviderId = "anthropic" | "openai" | "gemini" | "claude-code" | "codex" | "antigravity";

export type StreamOptions = {
	model?: string;
	apiKey?: string;
	/** Gateway for the Claude or OpenAI API; for Claude the key is then sent as a bearer token. */
	baseUrl?: string;
	systemPrompt: string;
	/** Empty folder the CLIs run in, so they see no project files. */
	workdir: string;
	/** Colon-separated folders searched for CLIs before PATH. */
	extraPath?: string;
	signal: AbortSignal;
	onDelta: (text: string) => void;
};

export type Provider = {
	id: ProviderId;
	title: string;
	stream: (messages: Message[], opts: StreamOptions) => Promise<void>;
};

/** An error whose message is shown to the user as-is, including how to fix it. */
export class ProviderError extends Error {}

export function requireKey(opts: StreamOptions, provider: string, setting: string): string {
	const key = opts.apiKey?.trim();
	if (!key) throw new ProviderError(`No ${provider} key yet. Add one under **${setting}** in Ask AI Settings (Ctrl+,).`);
	return key;
}

/** Runs an HTTP provider call with the user's stop signal plus the same 5-minute limit the CLIs get. */
export async function withTimeout(signal: AbortSignal, call: (signal: AbortSignal) => Promise<void>, provider: string) {
	try {
		await call(AbortSignal.any([signal, AbortSignal.timeout(300_000)]));
	} catch (err) {
		if (err instanceof DOMException && err.name === "TimeoutError") {
			throw new ProviderError(`${provider} took longer than 5 minutes and was stopped.`);
		}
		throw err;
	}
}

/** Folds a conversation into one prompt for CLIs that take a single message. */
export function transcript(messages: Message[]): string {
	if (messages.length === 1) return messages[0].content;
	const turns = messages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`);
	return `Conversation so far:\n\n${turns.join("\n\n")}\n\nReply to the last user message.`;
}
