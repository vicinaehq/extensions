import {
	Action,
	ActionPanel,
	Color,
	Icon,
	type LaunchProps,
	List,
	Toast,
	openExtensionPreferences,
	showToast,
} from "@vicinae/api";
import { homedir } from "node:os";
import { useEffect, useState } from "react";
import { prefersLocalOnly } from "./api";
import { ConversationDetailView, HistoryThreadItem } from "./components";
import {
	type DraftRecord,
	type UnifiedQueryResponse,
	launchAgyHandoff,
	resolveDraft,
	unifiedQuery,
} from "./daemon";
import { useChatController } from "./use-chat";

function shortenHome(fullPath: string): string {
	const home = homedir();
	return fullPath.startsWith(home) ? `~${fullPath.slice(home.length)}` : fullPath;
}

function buildMailtoHref(draft: DraftRecord): string {
	const params = new URLSearchParams();
	params.set("subject", draft.subject);
	params.set("body", draft.body);
	if (draft.cc.length > 0) params.set("cc", draft.cc.join(","));
	return `mailto:${draft.to.join(",")}?${params.toString()}`;
}

export default function AskWebCommand(props: LaunchProps) {
	const initialQuery = props.fallbackText?.trim() ?? "";
	const {
		thread,
		history,
		runTurn,
		openThread,
		removeThread,
		clearAllThreads,
		stopStreaming,
	} = useChatController({ initialQuery });

	const [directQuery, setDirectQuery] = useState("");
	const [unified, setUnified] = useState<UnifiedQueryResponse | null>(null);

	useEffect(() => {
		if (thread) return;
		let active = true;
		const timer = setTimeout(() => {
			void unifiedQuery(directQuery.trim(), 6).then((res) => {
				if (active && res) setUnified(res);
			});
		}, directQuery.trim() ? 75 : 0);
		return () => {
			active = false;
			clearTimeout(timer);
		};
	}, [directQuery, thread]);

	if (thread) {
		return (
			<ConversationDetailView
				thread={thread}
				history={history}
				onRunTurn={(q, mode, opts) => void runTurn(q, mode, opts)}
				onStop={stopStreaming}
				onSelectThread={openThread}
				onDeleteThread={removeThread}
				onClearHistory={clearAllThreads}
			/>
		);
	}

	const trimmed = directQuery.trim();
	const needle = trimmed.toLowerCase();
	const filteredHistory = needle
		? history.filter(
				(item) =>
					item.title.toLowerCase().includes(needle) ||
					item.turns.some((t) => t.query.toLowerCase().includes(needle)),
			)
		: history;

	const docs = unified?.docs ?? [];
	const messages = unified?.messages ?? [];
	const drafts = unified?.drafts ?? [];
	const isPrivate = unified?.max_sensitivity === "private_local";
	const routeTag = isPrivate
		? unified?.ollama.reachable
			? { value: "Private · Ollama", color: Color.Green }
			: { value: "Private · Local", color: Color.Orange }
		: { value: "Auto · Context + Web", color: Color.Blue };

	const handleDraftDecision = async (draft: DraftRecord, approve: boolean) => {
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: approve ? "Sending email..." : "Discarding draft...",
		});
		try {
			const res = await resolveDraft(draft.draft_id, approve, null);
			toast.style = Toast.Style.Success;
			toast.title = approve ? "Email Sent" : "Draft Discarded";
			toast.message = res.sent_message_id ?? res.outcome;
			const refreshed = await unifiedQuery(trimmed, 6);
			if (refreshed) setUnified(refreshed);
		} catch (err) {
			toast.style = Toast.Style.Failure;
			toast.title = "Action Failed";
			toast.message = err instanceof Error ? err.message : String(err);
		}
	};

	const submitUnified = (useWeb: boolean) => {
		if (!trimmed) return;
		setDirectQuery("");
		void runTurn(trimmed, "new", {
			useWeb,
			localDocs: docs.length > 0 ? docs : undefined,
			localMessages: messages.length > 0 ? messages : undefined,
			ollama: unified?.ollama,
		});
	};

	const hasItemsBelow =
		drafts.length > 0 || docs.length > 0 || messages.length > 0 || filteredHistory.length > 0;

	return (
		<List
			filtering={false}
			isShowingDetail={hasItemsBelow}
			searchText={directQuery}
			onSearchTextChange={setDirectQuery}
			searchBarPlaceholder="Ask anything, search Desktop/Documents/Emails/WhatsApp..."
		>
			<List.Item
				id="submit-initial"
				title={trimmed ? `Ask "${trimmed}"` : "Type a question or keyword above..."}
				icon={{ source: Icon.Stars, tintColor: Color.Purple }}
				accessories={trimmed ? [{ tag: routeTag }] : []}
				actions={
					<ActionPanel>
						<Action
							title={
								prefersLocalOnly(trimmed)
									? "Ask Local Context (Private)"
									: isPrivate
										? "Ask With Private + Web Hybrid"
										: "Ask With Context + Web"
							}
							icon={prefersLocalOnly(trimmed) ? Icon.Lock : Icon.ArrowRight}
							onAction={() => submitUnified(!prefersLocalOnly(trimmed))}
						/>
						<Action
							title={prefersLocalOnly(trimmed) ? "Include Web Results Too" : "Ask Using Local Context Only"}
							icon={prefersLocalOnly(trimmed) ? Icon.Globe01 : Icon.Lock}
							shortcut={{ modifiers: ["ctrl"], key: "return" }}
							onAction={() => submitUnified(prefersLocalOnly(trimmed))}
						/>
						{trimmed && (
							<Action
								title="Continue in Antigravity (agy)"
								icon={Icon.Terminal}
								shortcut={{ modifiers: ["ctrl", "shift"], key: "g" }}
								onAction={() =>
									void launchAgyHandoff({
										query: trimmed,
										documents: docs,
										messages,
									})
								}
							/>
						)}
						{trimmed && (
							<Action.OpenInBrowser
								title="Open in Google"
								url={`https://www.google.com/search?q=${encodeURIComponent(trimmed)}`}
							/>
						)}
						<Action title="Preferences" onAction={openExtensionPreferences} />
					</ActionPanel>
				}
			/>

			{drafts.length > 0 && (
				<List.Section title="Pending Email Drafts">
					{drafts.map((d) => (
						<List.Item
							key={d.draft_id}
							id={`draft:${d.draft_id}`}
							title={d.subject || "(No Subject)"}
							subtitle={`To: ${d.to.join(", ")}`}
							icon={{ source: Icon.Envelope, tintColor: Color.Orange }}
							accessories={[{ tag: { value: "Confirm Send", color: Color.Orange } }]}
							detail={
								<List.Item.Detail
									markdown={`### ${d.subject}\n**To:** ${d.to.join(", ")}\n\n---\n\n${d.body}`}
								/>
							}
							actions={
								<ActionPanel>
									<Action
										title="Send Email Now"
										icon={Icon.Envelope}
										onAction={() => void handleDraftDecision(d, true)}
									/>
									<Action.OpenInBrowser
										title="Open in Mail Client"
										url={buildMailtoHref(d)}
									/>
									<Action
										title="Discard Draft"
										icon={Icon.Trash}
										style={Action.Style.Destructive}
										shortcut={{ modifiers: ["ctrl"], key: "x" }}
										onAction={() => void handleDraftDecision(d, false)}
									/>
								</ActionPanel>
							}
						/>
					))}
				</List.Section>
			)}

			{docs.length > 0 && (
				<List.Section title="Documents & Notes">
					{docs.slice(0, 5).map((doc) => {
						const shortPath = shortenHome(doc.path);
						return (
							<List.Item
								key={doc.path}
								id={`doc:${doc.path}`}
								title={doc.title}
								subtitle={shortPath}
								icon={{
									source: doc.source_type === "pdf" ? Icon.Book : Icon.Text,
									tintColor: Color.Blue,
								}}
								accessories={[{ text: `L${doc.start_line}–${doc.end_line}` }]}
								detail={
									<List.Item.Detail
										markdown={`### ${doc.title}\n\`${shortPath}\` *(lines ${doc.start_line}–${doc.end_line})*\n\n---\n\n${doc.snippet}`}
									/>
								}
								actions={
									<ActionPanel>
										<Action.Open title="Open File" target={doc.path} />
										<Action
											title="Ask AI About File"
											icon={Icon.Stars}
											shortcut={{ modifiers: ["ctrl"], key: "return" }}
											onAction={() => {
												const q = trimmed || `Summarize ${doc.title}`;
												setDirectQuery("");
												void runTurn(q, "new", {
													useWeb: false,
													localDocs: [doc],
													ollama: unified?.ollama,
												});
											}}
										/>
										<Action.CopyToClipboard title="Copy Path" content={doc.path} />
									</ActionPanel>
								}
							/>
						);
					})}
				</List.Section>
			)}

			{messages.length > 0 && (
				<List.Section title="Emails & WhatsApp">
					{messages.slice(0, 5).map((msg) => (
						<List.Item
							key={msg.id}
							id={`msg:${msg.id}`}
							title={msg.subject || msg.chat_or_folder}
							subtitle={msg.sender}
							icon={{
								source: msg.connector === "whatsapp" ? Icon.SpeechBubble : Icon.Envelope,
								tintColor: Color.Green,
							}}
							accessories={[{ tag: { value: msg.connector, color: Color.SecondaryText } }]}
							detail={
								<List.Item.Detail
									markdown={`### ${msg.subject || msg.chat_or_folder}\n**From:** ${msg.sender}\n\n---\n\n${msg.snippet}`}
								/>
							}
							actions={
								<ActionPanel>
									<Action
										title="Ask AI About Message"
										icon={Icon.Stars}
										onAction={() => {
											const q = trimmed || `Summarize this message from ${msg.sender}`;
											setDirectQuery("");
											void runTurn(q, "new", {
												useWeb: false,
												localMessages: [msg],
												ollama: unified?.ollama,
											});
										}}
									/>
									<Action.CopyToClipboard title="Copy Snippet" content={msg.snippet} />
								</ActionPanel>
							}
						/>
					))}
				</List.Section>
			)}

			{filteredHistory.length > 0 && (
				<List.Section title="Recent Chats">
					{filteredHistory.map((item) => (
						<HistoryThreadItem
							key={item.id}
							thread={item}
							onResume={() => openThread(item)}
							onDelete={removeThread}
							onClearAll={clearAllThreads}
						/>
					))}
				</List.Section>
			)}
		</List>
	);
}
