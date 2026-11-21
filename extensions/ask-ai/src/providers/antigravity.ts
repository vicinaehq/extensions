import { runCli } from "./spawn.ts";
import { type Provider, ProviderError, transcript } from "./types.ts";

const LOGIN_HINT = "If you're signed out, run `agy` in a terminal and sign in.";

/** Maps one `agy -p --output-format stream-json` line to answer text, or throws on a failed result. */
export function antigravityLine(line: string): string | undefined {
	const msg = JSON.parse(line);
	const step = msg.step_update;
	if (msg.event === "step_update" && step?.step_type === "agent_response" && step.text_delta) return step.text_delta;
	if (msg.event === "result" && msg.result?.status !== "SUCCESS") {
		throw new ProviderError(`Antigravity: ${msg.result?.error ?? msg.result?.status ?? "failed"}\n\n${LOGIN_HINT}`);
	}
}

export const antigravity: Provider = {
	id: "antigravity",
	title: "Antigravity",
	async stream(messages, opts) {
		const prompt = `${opts.systemPrompt}\n\n${transcript(messages)}`;
		const args = [
			// The prompt goes through stdin, so it never shows in the process list.
			"--input-format", "stream-json",
			"--output-format", "stream-json",
			"--print-timeout", "290s",
			"--disable-slash-commands",
			// Restricts terminal commands. Tools that need a permission prompt are refused in this headless mode.
			"--sandbox",
			...(opts.model ? ["--model", opts.model] : []),
			"--print=",
		];
		let failure: unknown;
		let answered = false;
		const run = runCli({
			name: "agy",
			label: "Antigravity",
			loginHint: LOGIN_HINT,
			args,
			cwd: opts.workdir,
			extraPath: opts.extraPath,
			input: `${JSON.stringify({ event: "user", message: { content: prompt } })}\n`,
			signal: opts.signal,
			onLine(line) {
				try {
					const text = antigravityLine(line);
					if (text?.trim()) answered = true;
					if (text) opts.onDelta(text);
				} catch (err) {
					failure ??= err;
				}
			},
		});
		const stderr = await run.done.catch((err) => {
			throw failure ?? err;
		});
		if (failure) throw failure;
		if (!answered) throw new ProviderError(silentEndMessage(stderr));
	},
};

/** agy ends with no text when a tool it reached for needed a permission it can't ask for here. */
export function silentEndMessage(stderr: string): string {
	return /auto-denied|permission/i.test(stderr)
		? "Antigravity stopped without answering: it tried to use a tool (such as reading a file or running a command) that needs your permission, which Ask AI doesn't grant. Ask without needing your files or computer, or use another provider."
		: "Antigravity finished without an answer. Try asking again.";
}
