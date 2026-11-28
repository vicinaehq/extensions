import {
	Action,
	ActionPanel,
	Color,
	Detail,
	Grid,
	Icon,
	List,
	openExtensionPreferences,
	useNavigation,
} from "@vicinae/api";
import { useState } from "react";
import { extractDomain } from "./api";
import { getHistoryFilePath } from "./storage";
import type {
	ChatThread,
	ConversationTurn,
	TavilyImage,
	TavilyResult,
	TurnPhase,
	TurnRunMode,
} from "./types";

const MAX_INLINE_IMAGES = 2;

export function formatRelativeTime(timestamp: number): string {
	const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
	if (diffSec < 60) return "just now";
	const diffMin = Math.floor(diffSec / 60);
	if (diffMin < 60) return `${diffMin}m ago`;
	const diffHr = Math.floor(diffMin / 60);
	if (diffHr < 24) return `${diffHr}h ago`;
	const diffDay = Math.floor(diffHr / 24);
	return `${diffDay}d ago`;
}

function renderTurnBody(turn: ConversationTurn): string {
	if (turn.phase === "searching") return "_Searching web..._";
	if (turn.errorMsg && !turn.answer) return `> **Error:** ${turn.errorMsg}`;
	const text =
		turn.answer || (turn.phase === "synthesizing" ? "_Thinking..._" : "");
	return turn.errorMsg && turn.answer
		? `${text}\n\n> **Note:** ${turn.errorMsg}`
		: text;
}

export function formatThreadMarkdown(turns: ConversationTurn[]): string {
	if (turns.length === 0) return "";
	const [latest, ...previous] = turns;
	const sections: string[] = [`## ${latest.query}`, renderTurnBody(latest)];

	if (latest.phase === "done" && latest.images.length > 0) {
		const thumbs = latest.images
			.slice(0, MAX_INLINE_IMAGES)
			.map((img) => `![](${img.url}?raycast-height=88)`)
			.join(" ");
		sections.push(thumbs);
	}

	if (previous.length > 0) {
		sections.push("---");
		for (const turn of previous) {
			sections.push(`**${turn.query}**\n\n${renderTurnBody(turn)}`);
		}
	}

	return sections.join("\n\n");
}

function phaseStatus(phase: TurnPhase): { value: string; color: Color } {
	switch (phase) {
		case "searching":
			return { value: "Searching", color: Color.Blue };
		case "synthesizing":
			return { value: "Thinking", color: Color.Purple };
		case "done":
			return { value: "Ready", color: Color.Green };
		case "error":
			return { value: "Error", color: Color.Red };
	}
}

export function ImagesGallery(props: { query: string; images: TavilyImage[] }) {
	return (
		<Grid
			columns={3}
			fit={Grid.Fit.Contain}
			aspectRatio="16/9"
			navigationTitle={`Images · ${props.query}`}
			searchBarPlaceholder="Filter by domain..."
		>
			{props.images.map((img) => {
				const domain = extractDomain(img.url);
				return (
					<Grid.Item
						key={img.url}
						title={domain}
						keywords={[domain]}
						content={{ source: img.url, fallback: Icon.Image }}
						actions={
							<ActionPanel>
								<Action.OpenInBrowser title="Open Image" url={img.url} />
								<Action.CopyToClipboard
									title="Copy Image URL"
									content={img.url}
								/>
							</ActionPanel>
						}
					/>
				);
			})}
		</Grid>
	);
}

export function SourcesList(props: { query: string; results: TavilyResult[] }) {
	return (
		<List
			isShowingDetail
			navigationTitle={`Sources · ${props.query}`}
			searchBarPlaceholder="Filter sources..."
		>
			{props.results.map((item, idx) => {
				const domain = extractDomain(item.url);
				const md = `**${item.title}** · [${domain}](${item.url})\n\n${item.content || "_No snippet._"}`;
				return (
					<List.Item
						key={item.url}
						id={`src-${idx}`}
						title={`${idx + 1}. ${item.title}`}
						icon={Icon.Globe01}
						detail={<List.Item.Detail markdown={md} />}
						actions={
							<ActionPanel>
								<Action.OpenInBrowser
									title="Open in Browser"
									url={item.url}
								/>
								<Action.CopyToClipboard title="Copy URL" content={item.url} />
							</ActionPanel>
						}
					/>
				);
			})}
		</List>
	);
}

export function PromptInputView(props: {
	title: string;
	placeholder: string;
	priorTurns?: ConversationTurn[];
	onSubmit: (query: string) => void;
}) {
	const [text, setText] = useState("");
	const { pop } = useNavigation();
	const trimmed = text.trim();

	const submit = () => {
		if (!trimmed) return;
		pop();
		props.onSubmit(trimmed);
	};

	return (
		<List
			filtering={false}
			navigationTitle={props.title}
			searchText={text}
			onSearchTextChange={setText}
			searchBarPlaceholder={props.placeholder}
		>
			<List.Item
				id="submit-prompt"
				title={trimmed ? `Ask "${trimmed}"` : props.placeholder}
				icon={{ source: Icon.Stars, tintColor: Color.Purple }}
				actions={
					<ActionPanel>
						<Action title="Ask" icon={Icon.ArrowRight} onAction={submit} />
						<Action
							title="Preferences"
							onAction={openExtensionPreferences}
						/>
					</ActionPanel>
				}
			/>
			{props.priorTurns && props.priorTurns.length > 0 && (
				<List.Section title="Context">
					{props.priorTurns.slice(0, 3).map((turn) => (
						<List.Item
							key={turn.id}
							title={turn.query}
							icon={Icon.SpeechBubble}
						/>
					))}
				</List.Section>
			)}
		</List>
	);
}

export function HistoryThreadItem(props: {
	thread: ChatThread;
	onResume: () => void;
	onDelete: (thread: ChatThread) => Promise<boolean>;
	onClearAll: () => Promise<boolean>;
	extraActions?: React.ReactNode;
}) {
	const { thread } = props;
	const turnCount = thread.turns.length;
	const label = `${turnCount} ${turnCount === 1 ? "turn" : "turns"} · ${formatRelativeTime(thread.updatedAt)}`;

	return (
		<List.Item
			key={thread.id}
			id={thread.id}
			title={thread.title}
			accessories={[{ text: label }]}
			keywords={[thread.title, ...thread.turns.map((t) => t.query)]}
			icon={Icon.SpeechBubble}
			detail={<List.Item.Detail markdown={formatThreadMarkdown(thread.turns)} />}
			actions={
				<ActionPanel>
					<Action
						title="Resume Chat"
						icon={Icon.ArrowRight}
						onAction={props.onResume}
					/>
					<Action.CopyToClipboard
						title="Copy Latest Answer"
						content={thread.turns[0]?.answer ?? ""}
					/>
					<Action
						title="Delete Chat"
						icon={Icon.Trash}
						style={Action.Style.Destructive}
						shortcut={{ modifiers: ["ctrl"], key: "x" }}
						onAction={() => void props.onDelete(thread)}
					/>
					<Action
						title="Clear All History"
						icon={Icon.Trash}
						style={Action.Style.Destructive}
						shortcut={{ modifiers: ["ctrl", "shift"], key: "x" }}
						onAction={() => void props.onClearAll()}
					/>
					<Action.CopyToClipboard
						title="Copy History File Path"
						content={getHistoryFilePath()}
					/>
					{props.extraActions}
				</ActionPanel>
			}
		/>
	);
}

export function ChatHistoryView(props: {
	history: ChatThread[];
	onSelect: (thread: ChatThread) => void;
	onDelete: (thread: ChatThread) => Promise<boolean>;
	onClearAll: () => Promise<boolean>;
}) {
	const { pop } = useNavigation();

	return (
		<List
			isShowingDetail={props.history.length > 0}
			navigationTitle="AI Search History"
			searchBarPlaceholder="Filter previous chats..."
		>
			{props.history.map((item) => (
				<HistoryThreadItem
					key={item.id}
					thread={item}
					onResume={() => {
						props.onSelect(item);
						pop();
					}}
					onDelete={props.onDelete}
					onClearAll={props.onClearAll}
				/>
			))}
			{props.history.length === 0 && (
				<List.EmptyView
					title="No Saved Chats"
					description="Your AI web search conversations will appear here."
					icon={Icon.SpeechBubble}
				/>
			)}
		</List>
	);
}

export function ConversationDetailView(props: {
	thread: ChatThread;
	history: ChatThread[];
	onRunTurn: (query: string, mode: TurnRunMode) => void;
	onStop: () => void;
	onSelectThread: (thread: ChatThread) => void;
	onDeleteThread: (thread: ChatThread) => Promise<boolean>;
	onClearHistory: () => Promise<boolean>;
}) {
	const latest = props.thread.turns[0];
	const isLoading =
		latest.phase === "searching" || latest.phase === "synthesizing";
	const status = phaseStatus(latest.phase);

	return (
		<Detail
			isLoading={isLoading}
			navigationTitle={latest.query}
			markdown={formatThreadMarkdown(props.thread.turns)}
			metadata={
				<Detail.Metadata>
					<Detail.Metadata.Label title="Status" text={status} />
					<Detail.Metadata.Label
						title="Turns"
						text={String(props.thread.turns.length)}
					/>
					{latest.images.length > 0 && (
						<Detail.Metadata.Label
							title="Images"
							text={`${latest.images.length} · Ctrl+I`}
						/>
					)}
					{latest.results.length > 0 && (
						<>
							<Detail.Metadata.Separator />
							{latest.results.map((r, idx) => (
								<Detail.Metadata.Link
									key={r.url}
									title={`[${idx + 1}]`}
									target={r.url}
									text={extractDomain(r.url)}
								/>
							))}
						</>
					)}
				</Detail.Metadata>
			}
			actions={
				<ActionPanel>
					<Action.Push
						title="Ask Follow-up"
						icon={Icon.SpeechBubble}
						target={
							<PromptInputView
								title="Follow-up"
								placeholder="Ask a follow-up question..."
								priorTurns={props.thread.turns}
								onSubmit={(q) => props.onRunTurn(q, "followup")}
							/>
						}
					/>
					{latest.answer ? (
						<Action.CopyToClipboard
							title="Copy Answer"
							content={latest.answer}
						/>
					) : null}
					{latest.images.length > 0 && (
						<Action.Push
							title={`Browse Images (${latest.images.length})`}
							icon={Icon.Image}
							shortcut={{ modifiers: ["ctrl"], key: "i" }}
							target={
								<ImagesGallery query={latest.query} images={latest.images} />
							}
						/>
					)}
					{latest.results.length > 0 && (
						<Action.Push
							title={`Browse Sources (${latest.results.length})`}
							icon={Icon.Globe01}
							shortcut={{ modifiers: ["ctrl"], key: "s" }}
							target={
								<SourcesList query={latest.query} results={latest.results} />
							}
						/>
					)}
					<Action.Push
						title={`Chat History (${props.history.length})`}
						icon={Icon.SpeechBubbleActive}
						shortcut={{ modifiers: ["ctrl"], key: "h" }}
						target={
							<ChatHistoryView
								history={props.history}
								onSelect={props.onSelectThread}
								onDelete={props.onDeleteThread}
								onClearAll={props.onClearHistory}
							/>
						}
					/>
					<Action
						title="Regenerate"
						icon={Icon.ArrowClockwise}
						shortcut={{ modifiers: ["ctrl"], key: "r" }}
						onAction={() => props.onRunTurn(latest.query, "regenerate")}
					/>
					{isLoading ? (
						<Action
							title="Stop"
							icon={Icon.Exclamationmark}
							onAction={props.onStop}
						/>
					) : (
						<Action.Push
							title="New Search"
							icon={Icon.Plus}
							shortcut={{ modifiers: ["ctrl"], key: "n" }}
							target={
								<PromptInputView
									title="New Search"
									placeholder="Ask a new question..."
									onSubmit={(q) => props.onRunTurn(q, "new")}
								/>
							}
						/>
					)}
					<Action.OpenInBrowser
						title="Open in Google"
						url={`https://www.google.com/search?q=${encodeURIComponent(latest.query)}`}
					/>
					<Action
						title="Preferences"
						onAction={openExtensionPreferences}
					/>
				</ActionPanel>
			}
		/>
	);
}
