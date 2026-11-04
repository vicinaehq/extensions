import { runCli } from "./spawn.ts";
import { type Provider, ProviderError, transcript } from "./types.ts";

const LOGIN_HINT = "If you're signed out, run `claude auth login` in a terminal.";

/** Maps one `claude -p --output-format stream-json` line to answer text, or throws on a failed result. */
export function claudeCodeLine(line: string): string | undefined {
	const msg = JSON.parse(line);
	if (msg.type === "stream_event" && msg.event?.type === "content_block_delta" && msg.event.delta?.type === "text_delta") {
		return msg.event.delta.text;
	}
	if (msg.type === "result" && (msg.is_error || msg.subtype !== "success")) {
		throw new ProviderError(`Claude Code: ${msg.result || msg.subtype}\n\n${LOGIN_HINT}`);
	}
}

export const claudeCode: Provider = {
	id: "claude-code",
	title: "Claude Code",
	async stream(messages, opts) {
		const args = [
			"-p",
			"--output-format", "stream-json",
			"--verbose",
			"--include-partial-messages",
			"--no-session-persistence",
			"--tools", "",
			"--setting-sources", "",
			"--strict-mcp-config",
			"--disable-slash-commands",
			"--system-prompt", opts.systemPrompt,
			...(opts.model ? ["--model", opts.model] : []),
		];
		let failure: unknown;
		const run = runCli({
			name: "claude",
			label: "Claude Code",
			loginHint: LOGIN_HINT,
			args,
			cwd: opts.workdir,
			extraPath: opts.extraPath,
			input: transcript(messages),
			signal: opts.signal,
			onLine(line) {
				try {
					const text = claudeCodeLine(line);
					if (text) opts.onDelta(text);
				} catch (err) {
					failure ??= err;
				}
			},
		});
		await run.done.catch((err) => {
			throw failure ?? err;
		});
		if (failure) throw failure;
	},
};
