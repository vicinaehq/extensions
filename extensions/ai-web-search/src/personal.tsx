import {
	Action,
	ActionPanel,
	Color,
	Icon,
	type LaunchProps,
	List,
	Toast,
	showToast,
} from "@vicinae/api";
import { homedir } from "node:os";
import { useCallback, useEffect, useState } from "react";
import {
	type DaemonStatus,
	type DocumentHit,
	type MessageHit,
	getDaemonStatus,
	launchAgyHandoff,
	searchPersonalDocuments,
	searchPersonalMessages,
	triggerEmailSync,
	triggerReindex,
} from "./daemon";

const SCOPE_FILTERS = [
	{ id: "all", title: "All Sources (Files + Email)" },
	{ id: "desktop", title: "Desktop Only (~/Desktop)" },
	{ id: "documents", title: "Documents Only (~/Documents)" },
	{ id: "email", title: "Email Messages Only" },
	{ id: "markdown", title: "Markdown Notes Only" },
	{ id: "pdf", title: "PDF Documents Only" },
];

function shortenHome(fullPath: string): string {
	const home = homedir();
	return fullPath.startsWith(home) ? `~${fullPath.slice(home.length)}` : fullPath;
}

function sourceIcon(sourceType: string): Icon {
	switch (sourceType) {
		case "pdf":
			return Icon.Book;
		case "markdown":
			return Icon.Text;
		case "code":
			return Icon.Code;
		default:
			return Icon.BlankDocument;
	}
}

function formatSentTime(epochSec: number): string {
	if (!epochSec) return "";
	return new Date(epochSec * 1000).toLocaleDateString();
}

function buildDocDetailMarkdown(hit: DocumentHit, status: DaemonStatus | null): string {
	const displayPath = shortenHome(hit.path);
	const sensitivityNote =
		hit.sensitivity === "private_local"
			? "`private_local` (stays offline — blocked from cloud MCP)"
			: `\`${hit.sensitivity}\``;
	const statsFooter = status
		? `\n\n---\n_Index: ${status.stats.document_count} docs · ${status.stats.message_count} messages (${status.daemonRunning ? "live daemon" : "cached DB"})_`
		: "";

	return [
		`### ${hit.title}`,
		`**Path:** \`${displayPath}\` *(lines ${hit.start_line}–${hit.end_line})*`,
		`**Type:** \`${hit.source_type}\` · **Sensitivity:** ${sensitivityNote}`,
		"---",
		hit.snippet || "_No preview snippet available._",
		statsFooter,
	].join("\n\n");
}

function buildMsgDetailMarkdown(msg: MessageHit): string {
	const parts = [
		`### ${msg.subject || "(No Subject)"}`,
		`**From:** ${msg.sender}`,
		`**Folder:** \`${msg.chat_or_folder}\` · **Date:** ${formatSentTime(msg.sent_at)} · **Sensitivity:** \`${msg.sensitivity}\``,
	];
	if (msg.attachments.length > 0) {
		parts.push(`**Attachments:** ${msg.attachments.join(", ")}`);
	}
	parts.push("---", msg.snippet || "_Empty body._");
	return parts.join("\n\n");
}

export default function SearchPersonalContextCommand(props: LaunchProps) {
	const [query, setQuery] = useState(props.fallbackText?.trim() ?? "");
	const [scope, setScope] = useState("all");
	const [docHits, setDocHits] = useState<DocumentHit[]>([]);
	const [msgHits, setMsgHits] = useState<MessageHit[]>([]);
	const [status, setStatus] = useState<DaemonStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	const runSearch = useCallback(async (q: string, activeScope: string) => {
		setLoading(true);
		setErrorMsg(null);
		try {
			const wantDocs = activeScope !== "email";
			const wantMsgs = activeScope === "all" || activeScope === "email";

			const pathPrefix =
				activeScope === "desktop"
					? "~/Desktop"
					: activeScope === "documents"
						? "~/Documents"
						: undefined;
			const fileTypes =
				activeScope === "markdown"
					? ["markdown"]
					: activeScope === "pdf"
						? ["pdf"]
						: undefined;

			const [docsRes, msgsRes] = await Promise.all([
				wantDocs
					? searchPersonalDocuments(q, { pathPrefix, fileTypes, limit: 20 })
					: Promise.resolve([]),
				wantMsgs
					? searchPersonalMessages(q, { connector: "email", limit: 15 })
					: Promise.resolve([]),
			]);
			setDocHits(docsRes);
			setMsgHits(msgsRes);
		} catch (err) {
			setErrorMsg(err instanceof Error ? err.message : String(err));
			setDocHits([]);
			setMsgHits([]);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void getDaemonStatus().then(setStatus);
	}, []);

	useEffect(() => {
		const timer = setTimeout(() => {
			void runSearch(query, scope);
		}, 80);
		return () => clearTimeout(timer);
	}, [query, scope, runSearch]);

	const handleReindex = async () => {
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: "Reindexing local files...",
		});
		try {
			const msg = await triggerReindex();
			toast.style = Toast.Style.Success;
			toast.title = "Index Updated";
			toast.message = msg;
			void getDaemonStatus().then(setStatus);
			void runSearch(query, scope);
		} catch (err) {
			toast.style = Toast.Style.Failure;
			toast.title = "Reindex Failed";
			toast.message = err instanceof Error ? err.message : String(err);
		}
	};

	const handleSyncEmail = async () => {
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: "Syncing email (IMAP)...",
		});
		try {
			const msg = await triggerEmailSync();
			toast.style = Toast.Style.Success;
			toast.title = "Email Synced";
			toast.message = msg;
			void getDaemonStatus().then(setStatus);
			void runSearch(query, scope);
		} catch (err) {
			toast.style = Toast.Style.Failure;
			toast.title = "Email Sync Failed";
			toast.message = err instanceof Error ? err.message : String(err);
		}
	};

	const hasAny = docHits.length > 0 || msgHits.length > 0;

	return (
		<List
			filtering={false}
			isShowingDetail={hasAny}
			isLoading={loading}
			searchText={query}
			onSearchTextChange={setQuery}
			searchBarPlaceholder="Search files, PDFs, notes, and emails..."
			searchBarAccessory={
				<List.Dropdown tooltip="Filter indexed scope" value={scope} onChange={setScope}>
					{SCOPE_FILTERS.map((f) => (
						<List.Dropdown.Item key={f.id} title={f.title} value={f.id} />
					))}
				</List.Dropdown>
			}
		>
			{docHits.length > 0 && (
				<List.Section title="Documents & Notes">
					{docHits.map((hit) => {
						const shortPath = shortenHome(hit.path);
						const isPrivate = hit.sensitivity === "private_local";
						return (
							<List.Item
								key={hit.path}
								id={`doc:${hit.path}`}
								title={hit.title}
								subtitle={shortPath}
								icon={{
									source: sourceIcon(hit.source_type),
									tintColor: isPrivate ? Color.Orange : Color.Blue,
								}}
								accessories={[
									...(isPrivate ? [{ tag: { value: "Private", color: Color.Orange } }] : []),
									{ text: `L${hit.start_line}–${hit.end_line}` },
								]}
								detail={<List.Item.Detail markdown={buildDocDetailMarkdown(hit, status)} />}
								actions={
									<ActionPanel>
										<Action.Open title="Open File" target={hit.path} />
										<Action
											title="Continue in Antigravity (agy)"
											icon={Icon.Terminal}
											shortcut={{ modifiers: ["ctrl", "shift"], key: "g" }}
											onAction={() =>
												void launchAgyHandoff({
													query: query.trim() || `Analyze ${shortPath}`,
													documents: [hit],
												})
											}
										/>
										<Action.CopyToClipboard title="Copy Path" content={hit.path} />
										<Action.CopyToClipboard title="Copy Snippet" content={hit.snippet} />
										<Action
											title="Reindex Local Files"
											icon={Icon.ArrowClockwise}
											shortcut={{ modifiers: ["ctrl"], key: "r" }}
											onAction={() => void handleReindex()}
										/>
										<Action
											title="Sync Email Now"
											icon={Icon.Envelope}
											shortcut={{ modifiers: ["ctrl"], key: "e" }}
											onAction={() => void handleSyncEmail()}
										/>
									</ActionPanel>
								}
							/>
						);
					})}
				</List.Section>
			)}

			{msgHits.length > 0 && (
				<List.Section title="Email Messages">
					{msgHits.map((msg) => {
						const isPrivate = msg.sensitivity === "private_local";
						return (
							<List.Item
								key={msg.id}
								id={`msg:${msg.id}`}
								title={msg.subject || "(No Subject)"}
								subtitle={msg.sender}
								icon={{
									source: Icon.Envelope,
									tintColor: isPrivate ? Color.Orange : Color.Green,
								}}
								accessories={[
									{ text: msg.chat_or_folder },
									{ text: formatSentTime(msg.sent_at) },
								]}
								detail={<List.Item.Detail markdown={buildMsgDetailMarkdown(msg)} />}
								actions={
									<ActionPanel>
										<Action
											title="Continue in Antigravity (agy)"
											icon={Icon.Terminal}
											shortcut={{ modifiers: ["ctrl", "shift"], key: "g" }}
											onAction={() =>
												void launchAgyHandoff({
													query:
														query.trim() ||
														`Inspect thread ${msg.thread_id} ("${msg.subject}")`,
													messages: [msg],
												})
											}
										/>
										<Action.CopyToClipboard title="Copy Snippet" content={msg.snippet} />
										<Action.CopyToClipboard title="Copy Thread ID" content={msg.thread_id} />
										<Action
											title="Sync Email Now"
											icon={Icon.Envelope}
											shortcut={{ modifiers: ["ctrl"], key: "e" }}
											onAction={() => void handleSyncEmail()}
										/>
									</ActionPanel>
								}
							/>
						);
					})}
				</List.Section>
			)}

			{!loading && !hasAny && (
				<List.EmptyView
					title={errorMsg ? "Index Unavailable" : "No Matching Context"}
					description={
						errorMsg ??
						"Try different keywords, run Reindex Local Files (Ctrl+R), or Sync Email (Ctrl+E)."
					}
					icon={Icon.MagnifyingGlass}
					actions={
						<ActionPanel>
							<Action
								title="Reindex Local Files"
								icon={Icon.ArrowClockwise}
								onAction={() => void handleReindex()}
							/>
							<Action
								title="Sync Email Now"
								icon={Icon.Envelope}
								shortcut={{ modifiers: ["ctrl"], key: "e" }}
								onAction={() => void handleSyncEmail()}
							/>
							{query.trim() ? (
								<Action
									title="Ask Antigravity (agy)"
									icon={Icon.Terminal}
									shortcut={{ modifiers: ["ctrl", "shift"], key: "g" }}
									onAction={() => void launchAgyHandoff({ query: query.trim() })}
								/>
							) : null}
						</ActionPanel>
					}
				/>
			)}
		</List>
	);
}
