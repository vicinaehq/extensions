import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { environment } from "@vicinae/api";
import type { ChatThread, ConversationTurn } from "./types";

const HISTORY_FILE = "chats.json";
const MAX_THREADS = 50;

interface StoredHistory {
	version: 1;
	threads: ChatThread[];
}

export function getHistoryFilePath(): string {
	return join(environment.supportPath, HISTORY_FILE);
}

function normalizeLoadedTurn(raw: ConversationTurn): ConversationTurn {
	const phase =
		raw.phase === "searching" || raw.phase === "synthesizing"
			? raw.answer
				? "done"
				: "error"
			: raw.phase;
	return {
		...raw,
		phase,
		errorMsg:
			phase === "error" && !raw.errorMsg
				? "Interrupted before completion."
				: raw.errorMsg,
	};
}

export function loadChatThreads(): ChatThread[] {
	const filePath = getHistoryFilePath();
	if (!existsSync(filePath)) return [];

	try {
		const raw = readFileSync(filePath, "utf8");
		const parsed = JSON.parse(raw) as Partial<StoredHistory>;
		if (!Array.isArray(parsed.threads)) return [];

		return parsed.threads
			.filter(
				(t): t is ChatThread =>
					Boolean(t && typeof t.id === "string" && Array.isArray(t.turns) && t.turns.length > 0),
			)
			.map((t) => ({
				...t,
				turns: t.turns.map(normalizeLoadedTurn),
			}))
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.slice(0, MAX_THREADS);
	} catch {
		return [];
	}
}

function writeChatThreads(threads: ChatThread[]): void {
	const dir = environment.supportPath;
	mkdirSync(dir, { recursive: true });
	const target = join(dir, HISTORY_FILE);
	const tmp = join(dir, `${HISTORY_FILE}.${process.pid}.tmp`);

	const payload: StoredHistory = {
		version: 1,
		threads: threads.slice(0, MAX_THREADS),
	};

	writeFileSync(tmp, JSON.stringify(payload), "utf8");
	renameSync(tmp, target);
}

export function upsertChatThread(thread: ChatThread): ChatThread[] {
	const existing = loadChatThreads().filter((t) => t.id !== thread.id);
	const next = [thread, ...existing]
		.sort((a, b) => b.updatedAt - a.updatedAt)
		.slice(0, MAX_THREADS);
	writeChatThreads(next);
	return next;
}

export function deleteChatThread(threadId: string): ChatThread[] {
	const next = loadChatThreads().filter((t) => t.id !== threadId);
	writeChatThreads(next);
	return next;
}

export function clearChatThreads(): ChatThread[] {
	writeChatThreads([]);
	return [];
}
