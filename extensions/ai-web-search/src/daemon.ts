import { execFile } from "node:child_process";
import { chmodSync, unlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Toast, closeMainWindow, showToast } from "@vicinae/api";
import type { ChatThread, ScreenContext } from "./types";

const execFileAsync = promisify(execFile);

export interface DocumentHit {
	path: string;
	title: string;
	source_type: string;
	sensitivity: string;
	start_line: number;
	end_line: number;
	snippet: string;
	score: number;
}

export interface DaemonStatus {
	daemonRunning: boolean;
	pid?: number;
	stats: {
		document_count: number;
		chunk_count: number;
		message_count: number;
		db_size_bytes: number;
	};
	roots?: string[];
}

function getSocketPath(): string {
	const runtime = process.env.XDG_RUNTIME_DIR || join(homedir(), ".cache");
	return join(runtime, "omafind.sock");
}

function sendIpcRequest<T>(payload: Record<string, unknown>, timeoutMs = 1500): Promise<T> {
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
		// Fall through to direct CLI FTS5 lookup if daemon socket is unavailable
	}

	const args = ["search", query, "--json", "--include-private", "--limit", String(options?.limit ?? 25)];
	if (options?.pathPrefix) {
		args.push("--path-prefix", options.pathPrefix);
	}
	const { stdout } = await execFileAsync("omafind", args, { timeout: 4000 });
	const parsed = JSON.parse(stdout) as { hits?: DocumentHit[] };
	return Array.isArray(parsed.hits) ? parsed.hits : [];
}

export async function getDaemonStatus(): Promise<DaemonStatus | null> {
	try {
		const resp = await sendIpcRequest<{
			status: string;
			pid?: number;
			stats?: DaemonStatus["stats"];
			roots?: string[];
		}>({ op: "status" }, 800);
		if (resp.status === "status" && resp.stats) {
			return {
				daemonRunning: true,
				pid: resp.pid,
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

export async function launchAgyHandoff(params: {
	query?: string;
	cwd?: string;
	screenContext?: ScreenContext;
	thread?: ChatThread;
	documents?: DocumentHit[];
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
	};

	writeFileSync(tmpCtx, JSON.stringify(payload, null, 2), { encoding: "utf8", mode: 0o600 });
	chmodSync(tmpCtx, 0o600);

	const cwd =
		params.cwd ||
		params.screenContext?.terminal?.cwd ||
		"";
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
