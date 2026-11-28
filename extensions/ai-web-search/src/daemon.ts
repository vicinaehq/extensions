import { execFile } from "node:child_process";
import { chmodSync, unlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Toast, closeMainWindow, showToast } from "@vicinae/api";
import type {
	ChatThread,
	DocumentHitRef,
	DraftRecordRef,
	MessageHitRef,
	ScreenContext,
} from "./types";

const execFileAsync = promisify(execFile);

export type DocumentHit = DocumentHitRef;
export type MessageHit = MessageHitRef;
export type DraftRecord = DraftRecordRef;

export interface OllamaHealth {
	enabled: boolean;
	url: string;
	reachable: boolean;
	chat_model: string;
	embed_model: string;
	has_chat_model: boolean;
	has_embed_model: boolean;
	available_models: string[];
}

export interface PendingApprovalEntry {
	draft: DraftRecord;
	challenge?: string | null;
}

export interface SendOutcomePayload {
	draft_id: string;
	outcome: string;
	sent_message_id?: string | null;
}

export interface DaemonStatus {
	daemonRunning: boolean;
	pid?: number;
	emailEnabled?: boolean;
	emailAddress?: string | null;
	whatsappEnabled?: boolean;
	ollama?: OllamaHealth;
	stats: {
		document_count: number;
		chunk_count: number;
		message_count: number;
		email_count: number;
		whatsapp_count: number;
		pending_drafts_count: number;
		embedded_chunks_count: number;
		db_size_bytes: number;
	};
	roots?: string[];
}

export interface UnifiedQueryResponse {
	docs: DocumentHit[];
	messages: MessageHit[];
	drafts: DraftRecord[];
	max_sensitivity: string;
	ollama: OllamaHealth;
}

function getSocketPath(): string {
	const runtime = process.env.XDG_RUNTIME_DIR || join(homedir(), ".cache");
	return join(runtime, "omafind.sock");
}

function sendIpcRequest<T>(payload: Record<string, unknown>, timeoutMs = 2000): Promise<T> {
	return new Promise((resolve, reject) => {
		const sock = net.createConnection(getSocketPath());
		let buf = "";
		let settled = false;

		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				sock.destroy();
				reject(new Error("omafind-d IPC timeout"));
			}
		}, timeoutMs);

		sock.on("connect", () => {
			sock.write(`${JSON.stringify(payload)}\n`);
		});

		sock.on("data", (chunk) => {
			buf += chunk.toString("utf8");
			const nl = buf.indexOf("\n");
			if (nl !== -1 && !settled) {
				settled = true;
				clearTimeout(timer);
				sock.end();
				try {
					resolve(JSON.parse(buf.slice(0, nl)) as T);
				} catch (err) {
					reject(err);
				}
			}
		});

		sock.on("error", (err) => {
			if (!settled) {
				settled = true;
				clearTimeout(timer);
				reject(err);
			}
		});
	});
}

export async function unifiedQuery(
	query: string,
	limit = 8,
): Promise<UnifiedQueryResponse | null> {
	try {
		const resp = await sendIpcRequest<{
			status: string;
			docs?: DocumentHit[];
			messages?: MessageHit[];
			drafts?: DraftRecord[];
			max_sensitivity?: string;
			ollama?: OllamaHealth;
		}>({ op: "unified_query", query, limit }, 4000);
		if (resp.status === "unified_results" && resp.ollama) {
			return {
				docs: resp.docs ?? [],
				messages: resp.messages ?? [],
				drafts: resp.drafts ?? [],
				max_sensitivity: resp.max_sensitivity ?? "workspace",
				ollama: resp.ollama,
			};
		}
	} catch {
		// Fallback silently if daemon offline
	}
	return null;
}

export async function deidentifyForWeb(
	query: string,
	snippets: string[],
): Promise<string | null> {
	try {
		const resp = await sendIpcRequest<{
			status: string;
			public_query?: string;
		}>({ op: "deidentify_for_web", query, snippets }, 20_000);
		if (resp.status === "deidentified_query" && resp.public_query) {
			return resp.public_query;
		}
	} catch {
		// Fall back if de-identification fails
	}
	return null;
}

export async function createInlineDraft(params: {
	to: string[];
	cc?: string[];
	subject: string;
	body: string;
	attachments?: string[];
}): Promise<DraftRecord> {
	const resp = await sendIpcRequest<{
		status: string;
		draft?: DraftRecord;
		message?: string;
	}>({
		op: "create_draft",
		to: params.to,
		cc: params.cc ?? [],
		subject: params.subject,
		body: params.body,
		attachments: params.attachments ?? [],
		reply_to_message_id: null,
	});
	if (resp.status === "draft_created" && resp.draft) {
		return resp.draft;
	}
	throw new Error(resp.message || "Failed creating draft");
}

export async function searchPersonalDocuments(
	query: string,
	options?: {
		pathPrefix?: string;
		fileTypes?: string[];
		limit?: number;
	},
): Promise<DocumentHit[]> {
	try {
		const resp = await sendIpcRequest<{
			status: string;
			hits?: DocumentHit[];
			message?: string;
		}>({
			op: "search_documents",
			query,
			path_prefix: options?.pathPrefix ?? null,
			file_types: options?.fileTypes ?? null,
			allow_private: true,
			limit: options?.limit ?? 25,
		});
		if (resp.status === "search_results" && Array.isArray(resp.hits)) {
			return resp.hits;
		}
	} catch {
		// Fall through to CLI FTS5 lookup
	}

	const args = [
		"search",
		query,
		"--json",
		"--include-private",
		"--limit",
		String(options?.limit ?? 25),
	];
	if (options?.pathPrefix) {
		args.push("--path-prefix", options.pathPrefix);
	}
	const { stdout } = await execFileAsync("omafind", args, { timeout: 4000 });
	const parsed = JSON.parse(stdout) as { hits?: DocumentHit[] };
	return Array.isArray(parsed.hits) ? parsed.hits : [];
}

export async function searchPersonalMessages(
	query: string,
	options?: { connector?: string; limit?: number },
): Promise<MessageHit[]> {
	try {
		const resp = await sendIpcRequest<{
			status: string;
			hits?: MessageHit[];
		}>({
			op: "search_messages",
			query,
			connector: options?.connector ?? null,
			sender: null,
			since_ts: null,
			allow_private: true,
			limit: options?.limit ?? 20,
		});
		if (resp.status === "message_results" && Array.isArray(resp.hits)) {
			return resp.hits;
		}
	} catch {
		// Ignore when daemon offline
	}
	return [];
}

export async function listPendingApprovals(): Promise<PendingApprovalEntry[]> {
	try {
		const resp = await sendIpcRequest<{
			status: string;
			entries?: PendingApprovalEntry[];
			message?: string;
		}>({ op: "list_pending_approvals" }, 2000);
		if (resp.status === "pending_approvals" && Array.isArray(resp.entries)) {
			return resp.entries;
		}
		if (resp.status === "error" && resp.message) {
			throw new Error(resp.message);
		}
	} catch {
		const { stdout } = await execFileAsync("omafind", ["drafts", "list", "--json"], {
			timeout: 3000,
		});
		const parsed = JSON.parse(stdout) as { drafts?: DraftRecord[] };
		return (parsed.drafts ?? []).map((draft) => ({ draft, challenge: null }));
	}
	return [];
}

export async function resolveDraft(
	draftId: string,
	approve: boolean,
	challenge?: string | null,
): Promise<SendOutcomePayload> {
	const resp = await sendIpcRequest<{
		status: string;
		draft_id?: string;
		outcome?: string;
		sent_message_id?: string | null;
		message?: string;
	}>(
		{
			op: "resolve_draft",
			draft_id: draftId,
			approve,
			challenge: challenge ?? null,
		},
		25_000,
	);
	if (resp.status === "error") {
		throw new Error(resp.message || "Draft action failed");
	}
	return {
		draft_id: resp.draft_id ?? draftId,
		outcome: resp.outcome ?? (approve ? "sent" : "discarded"),
		sent_message_id: resp.sent_message_id ?? null,
	};
}

export async function getDaemonStatus(): Promise<DaemonStatus | null> {
	try {
		const resp = await sendIpcRequest<{
			status: string;
			pid?: number;
			email_enabled?: boolean;
			email_address?: string | null;
			whatsapp_enabled?: boolean;
			ollama?: OllamaHealth;
			stats?: DaemonStatus["stats"];
			roots?: string[];
		}>({ op: "status" }, 800);
		if (resp.status === "status" && resp.stats) {
			return {
				daemonRunning: true,
				pid: resp.pid,
				emailEnabled: resp.email_enabled,
				emailAddress: resp.email_address,
				whatsappEnabled: resp.whatsapp_enabled,
				ollama: resp.ollama,
				stats: resp.stats,
				roots: resp.roots,
			};
		}
	} catch {
		// Fallback to CLI status
	}

	try {
		const { stdout } = await execFileAsync("omafind", ["status", "--json"], {
			timeout: 3000,
		});
		return JSON.parse(stdout) as DaemonStatus;
	} catch {
		return null;
	}
}

export async function triggerReindex(): Promise<string> {
	const { stdout } = await execFileAsync("omafind", ["reindex"], {
		timeout: 15_000,
	});
	return stdout.trim() || "Index updated";
}

export async function triggerEmailSync(): Promise<string> {
	const { stdout } = await execFileAsync("omafind", ["sync"], {
		timeout: 30_000,
	});
	return stdout.trim() || "Email synced";
}

export async function launchAgyHandoff(params: {
	query?: string;
	cwd?: string;
	screenContext?: ScreenContext;
	thread?: ChatThread;
	documents?: DocumentHit[];
	messages?: MessageHit[];
}): Promise<void> {
	const runtime = process.env.XDG_RUNTIME_DIR || "/tmp";
	const tmpCtx = join(runtime, `omafind-vicinae-handoff-${Date.now()}.json`);

	const payload = {
		query: params.query ?? params.thread?.title ?? "",
		screenContext: params.screenContext,
		threadTurns: params.thread?.turns.slice(0, 3).map((t) => ({
			query: t.query,
			answer: t.answer,
			sources: t.results.map((r) => ({ title: r.title, url: r.url })),
		})),
		selectedDocuments: params.documents?.map((d) => ({
			path: d.path,
			title: d.title,
			lines: `${d.start_line}-${d.end_line}`,
			sensitivity: d.sensitivity,
		})),
		selectedMessages: params.messages?.map((m) => ({
			id: m.id,
			thread_id: m.thread_id,
			sender: m.sender,
			subject: m.subject,
			sent_at: m.sent_at,
		})),
	};

	writeFileSync(tmpCtx, JSON.stringify(payload, null, 2), { encoding: "utf8", mode: 0o600 });
	chmodSync(tmpCtx, 0o600);

	const cwd = params.cwd || params.screenContext?.terminal?.cwd || "";
	const args = ["handoff", "--context-file", tmpCtx];
	if (cwd) args.push("--cwd", cwd);
	if (payload.query) args.push("--query", payload.query);

	try {
		await execFileAsync("omafind", args, { timeout: 5000 });
		await showToast({
			style: Toast.Style.Success,
			title: "Opening in Antigravity (agy)",
		});
		await closeMainWindow();
	} catch (err) {
		try {
			unlinkSync(tmpCtx);
		} catch {
			// Ignore cleanup failure
		}
		await showToast({
			style: Toast.Style.Failure,
			title: "Handoff Failed",
			message: err instanceof Error ? err.message : String(err),
		});
	}
}
