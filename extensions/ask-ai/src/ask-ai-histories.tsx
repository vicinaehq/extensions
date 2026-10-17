import { Action, ActionPanel, Icon, List, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";
import { Composer } from "./ask-ai.tsx";
import { conversationMarkdown, transcriptText } from "./chat-view.tsx";
import { type Conversation, deleteConversation, listConversations, loadConversation } from "./store.ts";

/** Past conversations on the left, the selected one in full on the right. */
export default function AskAIHistories() {
	const { push } = useNavigation();
	const [conversations, setConversations] = useState<Conversation[]>();

	useEffect(() => {
		listConversations()
			.then((index) => Promise.all(index.map((e) => loadConversation(e.id))))
			.then((all) => setConversations(all.filter((c): c is Conversation => !!c)));
	}, []);

	return (
		<List isLoading={!conversations} isShowingDetail={!!conversations?.length} searchBarPlaceholder="Search conversations">
			<List.EmptyView title="No conversations yet" description="Ask something with Ask AI first." icon={Icon.SpeechBubble} />
			{conversations?.map((c) => (
				<List.Item
					key={c.id}
					id={c.id}
					title={c.title || "Untitled"}
					keywords={c.turns.map((t) => t.question)}
					icon={Icon.SpeechBubble}
					detail={
						<List.Item.Detail
							markdown={`${conversationMarkdown(c, false)}\n\n---\n\n_${new Date(c.updatedAt).toLocaleString(undefined, {
								dateStyle: "medium",
								timeStyle: "short",
							})}_`}
						/>
					}
					actions={
						<ActionPanel>
							<Action
								title="Continue Conversation"
								icon={Icon.ArrowRight}
								onAction={() => push(<Composer conversation={c} />)}
							/>
							<Action.CopyToClipboard
								title="Copy Conversation"
								content={transcriptText(c)}
								shortcut={{ modifiers: ["ctrl"], key: "c" }}
							/>
							<Action
								title="Delete Conversation"
								icon={Icon.Trash}
								style={Action.Style.Destructive}
								shortcut={{ modifiers: ["ctrl"], key: "x" }}
								onAction={async () => {
									await deleteConversation(c.id);
									setConversations((list) => list?.filter((x) => x.id !== c.id));
								}}
							/>
						</ActionPanel>
					}
				/>
			))}
		</List>
	);
}
