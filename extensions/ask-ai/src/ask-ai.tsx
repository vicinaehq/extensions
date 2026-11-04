import { Action, ActionPanel, Icon, List, clearSearchBar, useNavigation } from "@vicinae/api";
import { useEffect, useRef, useState } from "react";
import { ChatView } from "./chat-view.tsx";
import { providerById } from "./providers/index.ts";
import { ask, getConversation, openConversation, startNew, stop, useConversation } from "./session.ts";
import { loadSettings } from "./settings.ts";
import { SettingsForm } from "./settings-form.tsx";
import { type Conversation, listConversations, loadConversation } from "./store.ts";

/** Opening the command by name within this window continues the last conversation. */
const RESUME_WINDOW_MS = 10 * 60_000;

/**
 * The search bar is the composer: Enter sends and opens the full-width answer.
 * As a fallback command on Vicinae 0.24+, the unmatched root-search text arrives as a prop and is
 * sent straight away. Older Vicinae only puts it in the search bar, where Enter sends it.
 */
export function Composer(props: { fallbackText?: string; conversation?: Conversation }) {
	const { push } = useNavigation();
	const conv = useConversation();
	const [query, setQuery] = useState("");
	const [providerTitle, setProviderTitle] = useState<string>();
	const sawSearchEvent = useRef(false);
	const asked = useRef(false);

	const send = (text: string, fresh = false) => {
		if (!text.trim()) return;
		asked.current = true;
		clearSearchBar();
		setQuery("");
		ask(text, { fresh });
		push(<ChatView />);
	};

	useEffect(() => {
		loadSettings().then((s) => setProviderTitle(providerById(s.provider).title));
		if (props.conversation) {
			openConversation(props.conversation);
			return;
		}
		if (props.fallbackText?.trim()) {
			send(props.fallbackText, true);
			return;
		}
		// The extension process can outlive the window, so the in-memory conversation may be old too.
		listConversations().then(async ([latest]) => {
			const recent = latest && Date.now() - latest.updatedAt <= RESUME_WINDOW_MS ? await loadConversation(latest.id) : undefined;
			if (asked.current) return;
			if (recent) openConversation(recent);
			else if (Date.now() - getConversation().updatedAt > RESUME_WINDOW_MS) startNew();
		});
	}, []);

	// Leaving the command stops a running answer.
	useEffect(() => () => stop(), []);

	const onSearchTextChange = (text: string) => {
		const first = !sawSearchEvent.current;
		sawSearchEvent.current = true;
		// Vicinae may also replay the fallback text it already passed as a prop; it was sent.
		if (first && props.fallbackText && text === props.fallbackText) return;
		setQuery(text);
	};

	const latest = conv.turns.at(-1);
	const actions = (
		<ActionPanel>
			{query.trim() ? (
				<Action title="Send" icon={Icon.ArrowRight} onAction={() => send(query)} />
			) : (
				latest && <Action title="Open Conversation" icon={Icon.SpeechBubble} onAction={() => push(<ChatView />)} />
			)}
			<Action title="New Conversation" icon={Icon.Plus} shortcut="new" onAction={startNew} />
			<Action
				title="Settings"
				icon={Icon.Cog}
				shortcut={{ modifiers: ["ctrl"], key: "," }}
				onAction={() => push(<SettingsForm onSaved={(s) => setProviderTitle(providerById(s.provider).title)} />)}
			/>
		</ActionPanel>
	);

	return (
		<List
			filtering={false}
			onSearchTextChange={onSearchTextChange}
			searchBarPlaceholder={latest ? "Ask a follow-up…" : "Ask anything…"}
			navigationTitle={conv.title || "Ask AI"}
			actions={actions}
		>
			<List.EmptyView
				icon={Icon.Stars}
				title={query.trim() ? "Press Enter to ask" : latest ? conv.title : "Ask anything"}
				description={
					latest
						? `Enter opens the conversation. Type to ask a follow-up${providerTitle ? ` (${providerTitle})` : ""}.`
						: `Answers come from ${providerTitle ?? "your provider"}. Change it in Settings (Ctrl+,).`
				}
				actions={actions}
			/>
		</List>
	);
}

export default function AskAI(props: { fallbackText?: string }) {
	return <Composer fallbackText={props.fallbackText} />;
}
