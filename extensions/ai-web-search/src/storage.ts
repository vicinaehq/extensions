import {
	chmodSync,
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
const MAX_STORED_SNIPPET_CHARS = 1500;
const MAX_STORED_OCR_CHARS = 3000;

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

function compactThreadForStorage(thread: ChatThread): ChatThread {
	return {
		...thread,
		turns: thread.turns.map((turn) => ({
			...turn,
			results: turn.results.map((r) => ({
				...r,
				content:
					r.content.length > MAX_STORED_SNIPPET_CHARS
						? `${r.content.slice(0, MAX_STORED_SNIPPET_CHARS)}...`
						: r.content,
			})),
			screenContext: turn.screenContext
				? {
						...turn.screenContext,
						ocrText: turn.screenContext.ocrText?.slice(0, MAX_STORED_OCR_CHARS),
					}
				: undefined,
		})),
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
					Boolean(
						t &&
							typeof t.id === "string" &&
							Array.isArray(t.turns) &&
							t.turns.length > 0,
					),
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
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	try {
		chmodSync(dir, 0o700);
	} catch {
		// Best-effort on filesystems without POSIX mode bits
	}

	const target = join(dir, HISTORY_FILE);
	const tmp = join(dir, `${HISTORY_FILE}.${process.pid}.tmp`);

	const payload: StoredHistory = {
		version: 1,
		threads: threads.slice(0, MAX_THREADS).map(compactThreadForStorage),
	};

	writeFileSync(tmp, JSON.stringify(payload), { encoding: "utf8", mode: 0o600 });
	renameSync(tmp, target);
}

export function upsertChatThread(thread: ChatThread): ChatThread[] {
	const existing = loadChatThreads().filter((t) => t.id !== thread.id);
	const next = [compactThreadForStorage(thread), ...existing]
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
