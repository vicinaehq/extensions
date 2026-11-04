import { LocalStorage } from "@vicinae/api";
import type { Message, ProviderId } from "./providers/index.ts";

export type Turn = {
	id: string;
	question: string;
	answer: string;
	providerId: ProviderId;
	createdAt: number;
	status: "streaming" | "done" | "stopped" | "error";
	error?: string;
};

export type Conversation = { id: string; title: string; providerId: ProviderId; updatedAt: number; turns: Turn[] };

type IndexEntry = { id: string; title: string; updatedAt: number };

const INDEX_KEY = "index";
const MAX_CONVERSATIONS = 100;
const convKey = (id: string) => `conv:${id}`;

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const newConversation = (providerId: ProviderId): Conversation => ({
	id: newId(),
	title: "",
	providerId,
	updatedAt: Date.now(),
	turns: [],
});

/** Earlier finished turns as provider messages; failed and stopped-empty turns are left out. */
export function history(conv: Conversation): Message[] {
	return conv.turns.flatMap((t): Message[] =>
		t.answer && t.status !== "error"
			? [
					{ role: "user", content: t.question },
					{ role: "assistant", content: t.answer },
				]
			: [],
	);
}

async function readIndex(): Promise<IndexEntry[]> {
	const raw = await LocalStorage.getItem<string>(INDEX_KEY);
	try {
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

export async function listConversations(): Promise<IndexEntry[]> {
	return (await readIndex()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadConversation(id: string): Promise<Conversation | undefined> {
	const raw = await LocalStorage.getItem<string>(convKey(id));
	try {
		return raw ? JSON.parse(raw) : undefined;
	} catch {
		return undefined;
	}
}

export async function saveConversation(conv: Conversation): Promise<void> {
	if (!conv.turns.length) return;
	await LocalStorage.setItem(convKey(conv.id), JSON.stringify(conv));
	const index = (await readIndex()).filter((e) => e.id !== conv.id);
	index.push({ id: conv.id, title: conv.title, updatedAt: conv.updatedAt });
	index.sort((a, b) => b.updatedAt - a.updatedAt);
	for (const old of index.splice(MAX_CONVERSATIONS)) await LocalStorage.removeItem(convKey(old.id));
	await LocalStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export async function deleteConversation(id: string): Promise<void> {
	await LocalStorage.removeItem(convKey(id));
	await LocalStorage.setItem(INDEX_KEY, JSON.stringify((await readIndex()).filter((e) => e.id !== id)));
}
