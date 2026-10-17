import { Action, ActionPanel, Detail, Icon, useNavigation } from "@vicinae/api";
import { type RichAction, renderAnswer } from "./openui.ts";
import { providerById } from "./providers/index.ts";
import { ask, startNew, stop, useConversation } from "./session.ts";
import { SettingsForm } from "./settings-form.tsx";
import type { Conversation, Turn } from "./store.ts";
import { WidgetForm } from "./widget-form.tsx";

export function lastCodeBlock(markdown: string): string | undefined {
	const blocks = [...markdown.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
	return blocks.at(-1)?.[1].replace(/\n$/, "");
}

export function turnMarkdown(turn: Turn): string {
	const answer = renderAnswer(turn.answer).markdown;
	const body =
		turn.status === "error"
			? `${answer ? `${answer}\n\n---\n\n` : ""}**Couldn't get an answer.**\n\n${turn.error}`
			: turn.status === "stopped"
				? `${answer ? `${answer}\n\n` : ""}_Stopped._`
				: answer || "_Thinking…_";
	return `## ${turn.question}\n\n_${providerById(turn.providerId).title}_\n\n${body}`;
}

/** Newest turn first so a streaming answer stays in view; earlier turns follow, newest to oldest. */
export function conversationMarkdown(conv: Conversation, newestFirst: boolean): string {
	const turns = newestFirst ? [...conv.turns].reverse() : conv.turns;
	return turns.map(turnMarkdown).join("\n\n---\n\n");
}

export const transcriptText = (conv: Conversation) =>
	conv.turns.map((t) => `Q: ${t.question}\n\nA: ${renderAnswer(t.answer).markdown}`).join("\n\n---\n\n");

function richAction(action: RichAction, i: number) {
	switch (action.kind) {
		case "open":
			return <Action.OpenInBrowser key={i} title={action.label} url={action.url} />;
		case "copy":
			return <Action.CopyToClipboard key={i} title={action.label} content={action.text} />;
		case "ask":
			return <Action key={i} title={`Ask: ${action.question}`} icon={Icon.SpeechBubble} onAction={() => ask(action.question)} />;
	}
}

/** The full-width answer view. Esc (or Ask Follow-up) returns to the search bar for the next question. */
export function ChatView() {
	const { pop, push } = useNavigation();
	const conv = useConversation();
	const latest = conv.turns.at(-1);
	const streaming = latest?.status === "streaming";
	const { markdown: answer, actions: rich, widgets } = renderAnswer(latest?.answer ?? "");
	const code = lastCodeBlock(answer);

	return (
		<Detail
			navigationTitle={conv.title || "Ask AI"}
			markdown={conversationMarkdown(conv, true)}
			{...({ isLoading: streaming } as object)}
			actions={
				<ActionPanel>
					<Action.CopyToClipboard
						title="Copy Answer"
						content={answer}
						shortcut={{ modifiers: ["ctrl"], key: "c" }}
					/>
					<Action title="Ask Follow-up" icon={Icon.SpeechBubble} shortcut={{ modifiers: ["ctrl"], key: "l" }} onAction={pop} />
					{!streaming && (widgets.length > 0 || rich.length > 0) && (
						<ActionPanel.Section title="From the Answer">
							{widgets.map((w, i) => (
								<Action
									key={`w${i}`}
									title={`Open ${w.title}`}
									icon={Icon.Calculator}
									shortcut={i === 0 ? { modifiers: ["ctrl"], key: "o" } : undefined}
									onAction={() => push(<WidgetForm widget={w} />)}
								/>
							))}
							{rich.map(richAction)}
						</ActionPanel.Section>
					)}
					<Action.Paste title="Paste Answer" content={answer} />
					{code !== undefined && (
						<Action.CopyToClipboard
							title="Copy Last Code Block"
							content={code}
							shortcut={{ modifiers: ["ctrl", "shift"], key: "k" }}
						/>
					)}
					<Action.CopyToClipboard
						title="Copy Conversation"
						content={transcriptText(conv)}
						shortcut={{ modifiers: ["ctrl", "shift"], key: "c" }}
					/>
					{streaming ? (
						<Action title="Stop" icon={Icon.Stop} shortcut={{ modifiers: ["ctrl"], key: "." }} onAction={stop} />
					) : (
						latest && (
							<Action
								title="Ask Again"
								icon={Icon.ArrowClockwise}
								shortcut={{ modifiers: ["ctrl"], key: "r" }}
								onAction={() => ask(latest.question)}
							/>
						)
					)}
					<Action
						title="New Conversation"
						icon={Icon.Plus}
						shortcut="new"
						onAction={() => {
							startNew();
							pop();
						}}
					/>
					<Action
						title="Settings"
						icon={Icon.Cog}
						shortcut={{ modifiers: ["ctrl"], key: "," }}
						onAction={() => push(<SettingsForm />)}
					/>
				</ActionPanel>
			}
		/>
	);
}
