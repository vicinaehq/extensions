import { runCli } from "./spawn.ts";
import { type Provider, ProviderError, transcript } from "./types.ts";

const LOGIN_HINT = "If you're signed out, run `codex login` in a terminal.";

type RpcMessage = { id?: number | string; method?: string; params?: any; result?: any; error?: { message?: string } };

/** Codex features that give the model tools (shell, browser, computer control, sub-agents, ...). */
const TOOL_FEATURES = [
	"apps",
	"plugins",
	"shell_tool",
	"unified_exec",
	"browser_use",
	"browser_use_external",
	"computer_use",
	"in_app_browser",
	"image_generation",
	"view_image",
	"multi_agent",
	"memories",
	"hooks",
	"skill_search",
	"tool_suggest",
	"goals",
	"worktrees",
];

/**
 * Talks to `codex app-server` over stdio JSON-RPC: one ephemeral, read-only thread per turn,
 * with tool features, web search and the user's MCP servers switched off, so the model can only answer.
 * Features are turned off with `-c features.X=false`, which only warns for a name a future Codex drops
 * (`--disable X` would refuse to start).
 */
export const codex: Provider = {
	id: "codex",
	title: "Codex",
	async stream(messages, opts) {
		let nextId = 0;
		const pending = new Map<number, { resolve: (v: any) => void; reject: (e: unknown) => void }>();
		let finish!: (err?: unknown) => void;
		const finished = new Promise<void>((resolve, reject) => {
			finish = (err) => (err ? reject(err) : resolve());
		});

		const run = runCli({
			name: "codex",
			label: "Codex",
			loginHint: LOGIN_HINT,
			args: ["app-server", ...TOOL_FEATURES.flatMap((f) => ["-c", `features.${f}=false`]), "-c", 'web_search="disabled"'],
			cwd: opts.workdir,
			extraPath: opts.extraPath,
			keepStdinOpen: true,
			signal: opts.signal,
			onLine(line) {
				let msg: RpcMessage;
				try {
					msg = JSON.parse(line);
				} catch {
					return;
				}
				if (msg.id !== undefined && msg.method) {
					// Server-initiated request (approval, user input, ...): never grant anything.
					send({ id: msg.id, error: { code: -32601, message: "Not supported by Ask AI" } });
					return;
				}
				if (msg.id !== undefined) {
					const p = pending.get(Number(msg.id));
					pending.delete(Number(msg.id));
					if (msg.error) p?.reject(new ProviderError(`Codex: ${msg.error.message}\n\n${LOGIN_HINT}`));
					else p?.resolve(msg.result);
					return;
				}
				const event = codexNotification(msg);
				if (event?.delta) opts.onDelta(event.delta);
				if (event?.error) finish(new ProviderError(`Codex: ${event.error}\n\n${LOGIN_HINT}`));
				if (event?.done) finish();
			},
		});

		const send = (msg: object) => run.child.stdin.write(`${JSON.stringify(msg)}\n`);
		const call = (method: string, params: object) =>
			new Promise<any>((resolve, reject) => {
				const id = ++nextId;
				pending.set(id, { resolve, reject });
				send({ id, method, params });
			});

		const exited = run.done.then(
			() => {
				throw new ProviderError(`Codex stopped before answering.\n\n${LOGIN_HINT}`);
			},
			(err) => {
				throw err;
			},
		);
		const session = (async () => {
			await call("initialize", {
				clientInfo: { name: "vicinae-ask-ai", title: "Ask AI", version: "1" },
				capabilities: { experimentalApi: false, requestAttestation: false },
			});
			send({ method: "initialized" });
			const { config } = await call("config/read", { cwd: opts.workdir });
			const mcpOff = Object.fromEntries(Object.keys(config?.mcp_servers ?? {}).map((name) => [name, { enabled: false }]));
			const { thread } = await call("thread/start", {
				cwd: opts.workdir,
				approvalPolicy: "never",
				sandbox: "read-only",
				ephemeral: true,
				developerInstructions: opts.systemPrompt,
				config: { mcp_servers: mcpOff, web_search: "disabled" },
				...(opts.model ? { model: opts.model } : {}),
			});
			await call("turn/start", {
				threadId: thread.id,
				input: [{ type: "text", text: transcript(messages), text_elements: [] }],
			});
			await finished;
		})();

		// Whichever loses the race settles later; keep that from becoming an unhandled rejection.
		session.catch(() => {});
		exited.catch(() => {});
		try {
			await Promise.race([session, exited]);
		} finally {
			run.child.stdin.end();
			run.child.kill("SIGTERM");
		}
	},
};

/** Maps one app-server notification to answer text, an error, or completion. */
export function codexNotification(msg: RpcMessage): { delta?: string; error?: string; done?: boolean } | undefined {
	switch (msg.method) {
		case "item/agentMessage/delta":
			return { delta: msg.params?.delta };
		case "error":
			return msg.params?.willRetry ? undefined : { error: msg.params?.error?.message ?? "unknown error" };
		case "turn/completed": {
			const turn = msg.params?.turn;
			if (turn?.status === "completed") return { done: true };
			return { error: turn?.error?.message ?? `turn ${turn?.status ?? "ended"}` };
		}
	}
}
