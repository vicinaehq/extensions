import {
	Action,
	ActionPanel,
	Color,
	Icon,
	type LaunchProps,
	List,
	openExtensionPreferences,
} from "@vicinae/api";
import { useState } from "react";
import { ConversationDetailView, HistoryThreadItem } from "./components";
import { useChatController } from "./use-chat";

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

	if (thread) {
		return (
			<ConversationDetailView
				thread={thread}
				history={history}
				onRunTurn={(q, mode) => void runTurn(q, mode)}
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

	return (
		<List
			filtering={false}
			isShowingDetail={filteredHistory.length > 0 && trimmed.length === 0}
			searchText={directQuery}
			onSearchTextChange={setDirectQuery}
			searchBarPlaceholder="Ask anything or pick a recent chat..."
		>
			<List.Item
				id="submit-initial"
				title={trimmed ? `Ask "${trimmed}"` : "Type a question above..."}
				icon={{ source: Icon.Stars, tintColor: Color.Purple }}
				actions={
					<ActionPanel>
						<Action
							title="Ask"
							icon={Icon.ArrowRight}
							onAction={() => {
								if (trimmed) {
									setDirectQuery("");
									void runTurn(trimmed, "new");
								}
							}}
						/>
						{trimmed && (
							<Action.OpenInBrowser
								title="Open in Google"
								url={`https://www.google.com/search?q=${encodeURIComponent(trimmed)}`}
							/>
						)}
						<Action
							title="Preferences"
							onAction={openExtensionPreferences}
						/>
					</ActionPanel>
				}
			/>

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
