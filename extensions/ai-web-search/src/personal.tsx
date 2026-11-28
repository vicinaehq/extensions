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
	getDaemonStatus,
	launchAgyHandoff,
	searchPersonalDocuments,
	triggerReindex,
} from "./daemon";

const SCOPE_FILTERS = [
	{ id: "all", title: "All Indexed Sources" },
	{ id: "desktop", title: "Desktop Only (~/Desktop)" },
	{ id: "documents", title: "Documents Only (~/Documents)" },
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

function buildHitDetailMarkdown(hit: DocumentHit, status: DaemonStatus | null): string {
	const displayPath = shortenHome(hit.path);
	const sensitivityNote =
		hit.sensitivity === "private_local"
			? "`private_local` (stays offline — blocked from cloud MCP)"
			: `\`${hit.sensitivity}\``;
	const statsFooter = status
		? `\n\n---\n_Index: ${status.stats.document_count} docs · ${status.stats.chunk_count} chunks (${status.daemonRunning ? "live daemon" : "cached DB"})_`
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

export default function SearchPersonalContextCommand(props: LaunchProps) {
	const [query, setQuery] = useState(props.fallbackText?.trim() ?? "");
	const [scope, setScope] = useState("all");
	const [hits, setHits] = useState<DocumentHit[]>([]);
	const [status, setStatus] = useState<DaemonStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	const runSearch = useCallback(async (q: string, activeScope: string) => {
		setLoading(true);
		setErrorMsg(null);
		try {
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
			const res = await searchPersonalDocuments(q, {
				pathPrefix,
				fileTypes,
				limit: 25,
			});
			setHits(res);
		} catch (err) {
			setErrorMsg(err instanceof Error ? err.message : String(err));
			setHits([]);
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

	return (
		<List
			filtering={false}
			isShowingDetail={hits.length > 0}
			isLoading={loading}
			searchText={query}
			onSearchTextChange={setQuery}
			searchBarPlaceholder="Search inside Desktop, Documents, PDFs, notes..."
			searchBarAccessory={
				<List.Dropdown tooltip="Filter indexed scope" value={scope} onChange={setScope}>
					{SCOPE_FILTERS.map((f) => (
						<List.Dropdown.Item key={f.id} title={f.title} value={f.id} />
					))}
				</List.Dropdown>
			}
		>
			{hits.map((hit) => {
				const shortPath = shortenHome(hit.path);
				const isPrivate = hit.sensitivity === "private_local";
				return (
					<List.Item
						key={hit.path}
						id={hit.path}
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
						detail={<List.Item.Detail markdown={buildHitDetailMarkdown(hit, status)} />}
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
							</ActionPanel>
						}
					/>
				);
			})}

			{!loading && hits.length === 0 && (
				<List.EmptyView
					title={errorMsg ? "Index Unavailable" : "No Matching Documents"}
					description={
						errorMsg ??
						"Try different keywords or run Reindex Local Files (Ctrl+R) to scan ~/Desktop and ~/Documents."
					}
					icon={Icon.MagnifyingGlass}
					actions={
						<ActionPanel>
							<Action
								title="Reindex Local Files"
								icon={Icon.ArrowClockwise}
								onAction={() => void handleReindex()}
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
