import { Action, ActionPanel, Icon, List, clearSearchBar, environment, useNavigation } from "@vicinae/api";
import { useEffect, useRef, useState } from "react";
import { ChatView } from "./chat-view.tsx";
import { providerById } from "./providers/index.ts";
import { ask, getConversation, openConversation, startNew, stop, useConversation } from "./session.ts";
import { loadSettings } from "./settings.ts";
import { SettingsForm } from "./settings-form.tsx";
import { type Conversation, listConversations, loadConversation } from "./store.ts";

/**
 * Vicinae 0.24+ passes fallback text as a prop. Older versions only replay it as the first search
 * event right after mount, so there a quick first event longer than one keystroke is taken as fallback text.
 */
const FALLBACK_WINDOW_MS = 500;
const fallbackByTiming = (() => {
	const [major, minor] = (environment.vicinaeVersion?.tag ?? "").replace(/^v/, "").split(".").map(Number);
	return Number.isFinite(major) && Number.isFinite(minor) ? major === 0 && minor < 24 : true;
})();
/** Opening the command by name within this window continues the last conversation. */
const RESUME_WINDOW_MS = 10 * 60_000;

/**
 * The search bar is the composer: Enter sends and opens the full-width answer.
 * As a fallback command, the unmatched root-search text is sent straight away.
 */
export function Composer(props: { fallbackText?: string; conversation?: Conversation }) {
	const { push } = useNavigation();
	const conv = useConversation();
	const [query, setQuery] = useState("");
	const [providerTitle, setProviderTitle] = useState<string>();
	const mountedAt = useRef(Date.now());
	const sawSearchEvent = useRef(false);
	const fallbackSent = useRef<string | undefined>(undefined);
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
		// Newer Vicinae passes the fallback text as a prop.
		if (props.fallbackText?.trim()) {
			fallbackSent.current = props.fallbackText;
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
		const early = Date.now() - mountedAt.current < FALLBACK_WINDOW_MS;
		// Replayed fallback text arrives whole; a user typing after a launch by name starts with one character.
		if (fallbackByTiming && first && early && text.trim().length > 1 && !props.conversation) {
			if (fallbackSent.current !== text) {
				fallbackSent.current = text;
				send(text, true);
			}
			return;
		}
		if (early && text === fallbackSent.current) return;
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
