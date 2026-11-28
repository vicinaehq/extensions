import { Action, Icon, List, openExtensionPreferences } from "@vicinae/api";
import { ConversationDetailView, HistoryThreadItem } from "./components";
import { useChatController } from "./use-chat";

export default function SearchHistoryCommand() {
	const {
		thread,
		history,
		runTurn,
		openThread,
		removeThread,
		clearAllThreads,
		stopStreaming,
	} = useChatController({});

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

	return (
		<List
			isShowingDetail={history.length > 0}
			navigationTitle="AI Search History"
			searchBarPlaceholder="Search previous AI chats..."
		>
			{history.map((item) => (
				<HistoryThreadItem
					key={item.id}
					thread={item}
					onResume={() => openThread(item)}
					onDelete={removeThread}
					onClearAll={clearAllThreads}
					extraActions={
						<Action
							title="Preferences"
							onAction={openExtensionPreferences}
						/>
					}
				/>
			))}
			{history.length === 0 && (
				<List.EmptyView
					title="No Saved Chats"
					description="Start an AI Web Search first and your conversations will be saved here."
					icon={Icon.SpeechBubble}
				/>
			)}
		</List>
	);
}
