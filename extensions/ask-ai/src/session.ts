import { environment } from "@vicinae/api";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { useSyncExternalStore } from "react";
import { ProviderError, providerById } from "./providers/index.ts";
import { loadSettings, systemPrompt } from "./settings.ts";
import { type Conversation, type Turn, history, newConversation, newId, saveConversation } from "./store.ts";

/**
 * The live conversation of this command. Kept outside React so pushed views
 * (the full answer view) re-render while the root view streams into it.
 */
let conv: Conversation = newConversation("claude-code");
let controller: AbortController | undefined;
const listeners = new Set<() => void>();

const FLUSH_MS = 100;
const SAVE_MS = 2000;

function set(next: Conversation) {
	conv = next;
	for (const l of listeners) l();
}

export const getConversation = () => conv;

export function useConversation(): Conversation {
	return useSyncExternalStore(
		(l) => {
			listeners.add(l);
			return () => listeners.delete(l);
		},
		() => conv,
	);
}

/** A saved conversation can hold a turn that was cut off mid-answer. */
export function openConversation(next: Conversation) {
	stop();
	set({ ...next, turns: next.turns.map((t) => (t.status === "streaming" ? { ...t, status: "stopped" } : t)) });
}

export function startNew() {
	stop();
	set(newConversation(conv.providerId));
}

export function stop() {
	controller?.abort();
}

/** Sends a question in the current conversation (or a fresh one) and streams the answer into it. */
export async function ask(raw: string, opts: { fresh?: boolean } = {}) {
	const question = raw.trim();
	if (!question) return;
	stop();
	const own = new AbortController();
	controller = own;

	const settings = await loadSettings();
	// Stopped, or replaced by a new conversation, while settings loaded.
	if (own.signal.aborted) return;
	const provider = providerById(settings.provider);
	const base = opts.fresh ? newConversation(provider.id) : conv;
	const turn: Turn = { id: newId(), question, answer: "", providerId: provider.id, createdAt: Date.now(), status: "streaming" };
	const messages = [...history(base), { role: "user" as const, content: question }];

	// This ask's own conversation. If the user moves to another one, updates and saves still land here.
	let mine: Conversation = {
		...base,
		providerId: provider.id,
		title: base.title || question.slice(0, 80),
		updatedAt: Date.now(),
		turns: [...base.turns, turn],
	};
	set(mine);
	const current = () => (conv.id === mine.id ? conv : mine);
	const updateTurn = (turnId: string, patch: Partial<Turn>) => {
		const c = current();
		mine = { ...c, updatedAt: Date.now(), turns: c.turns.map((t) => (t.id === turnId ? { ...t, ...patch } : t)) };
		if (conv.id === mine.id) set(mine);
	};

	const workdir = join(environment.supportPath, "workdir");
	mkdirSync(workdir, { recursive: true });

	// Deltas arrive faster than the host can re-render; batch them.
	let answer = "";
	let flushed = "";
	const flush = () => {
		if (answer !== flushed) {
			flushed = answer;
			updateTurn(turn.id, { answer });
		}
	};
	const flushTimer = setInterval(flush, FLUSH_MS);
	const saveTimer = setInterval(() => saveConversation(current()), SAVE_MS);

	try {
		await provider.stream(messages, {
			...settings.providers[provider.id],
			systemPrompt: systemPrompt(settings),
			workdir,
			extraPath: settings.extraPath,
			signal: own.signal,
			onDelta: (text) => {
				answer += text;
			},
		});
		updateTurn(turn.id, answer ? { answer, status: "done" } : { status: "error", error: "The answer was empty." });
	} catch (err) {
		if (own.signal.aborted) updateTurn(turn.id, { answer, status: "stopped" });
		else {
			const message =
				err instanceof ProviderError ? err.message : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
			updateTurn(turn.id, { answer, status: "error", error: message });
		}
	} finally {
		clearInterval(flushTimer);
		clearInterval(saveTimer);
		if (controller === own) controller = undefined;
		await saveConversation(current());
	}
}
