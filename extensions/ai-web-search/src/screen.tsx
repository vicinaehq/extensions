import {
	Action,
	ActionPanel,
	Color,
	Detail,
	Icon,
	type LaunchProps,
	List,
	openExtensionPreferences,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { ConversationDetailView } from "./components";
import { captureScreenContext } from "./context";
import { launchAgyHandoff } from "./daemon";
import type { ScreenContext } from "./types";
import { useChatController } from "./use-chat";

const QUICK_SCREEN_PROMPTS = [
	{
		id: "summarize",
		title: "Summarize what's on screen",
		query: "Summarize what is on my screen right now and highlight key points.",
	},
	{
		id: "explain-error",
		title: "Explain error or issue shown",
		query:
			"Explain any error, warning, or issue visible on screen and how to fix it.",
	},
	{
		id: "next-steps",
		title: "Suggest next steps",
		query:
			"Based on the active window and text on screen, what should I do next?",
	},
];

function buildContextPreviewMarkdown(ctx: ScreenContext | null): string {
	if (!ctx) return "_Capturing active window context..._";
	if (ctx.blocked) {
		return `> **Privacy protection active:** ${ctx.reason ?? "Sensitive window detected."}\n\nScreen and clipboard capture were blocked.`;
	}

	const summaryChips: string[] = [];
	if (ctx.window) summaryChips.push(`\`${ctx.window.className}\``);
	if (ctx.terminal?.cwd) summaryChips.push(`\`${ctx.terminal.cwd}\``);
	if (ctx.activeTab) {
		summaryChips.push(`[${ctx.activeTab.title || "Active Tab"}](${ctx.activeTab.url})`);
	}
	if (ctx.ocrText) {
		summaryChips.push(`${ctx.ocrText.split("\n").length} OCR lines`);
	}

	const blocks: string[] = [];
	if (summaryChips.length > 0) {
		blocks.push(`**Context:** ${summaryChips.join(" · ")}`);
	}
	if (ctx.window?.title) {
		blocks.push(`*Window:* ${ctx.window.title}`);
	}
	if (ctx.visibleWindows && ctx.visibleWindows.length > 0) {
		const list = ctx.visibleWindows.map((w) => `\`${w.className}\``).join(", ");
		blocks.push(`*Also open:* ${list}`);
	}
	if (ctx.selection) {
		blocks.push(
			`**Selected Text**\n\`\`\`\n${ctx.selection.slice(0, 450)}\n\`\`\``,
		);
	}
	if (ctx.clipboard) {
		blocks.push(
			`**Clipboard**\n\`\`\`\n${ctx.clipboard.slice(0, 450)}\n\`\`\``,
		);
	}
	if (ctx.ocrText) {
		blocks.push(
			`**Visible Text Excerpt**\n\`\`\`\n${ctx.ocrText.slice(0, 750)}\n\`\`\``,
		);
	}
	if (blocks.length === 0) {
		blocks.push("_No text captured from the active window._");
	}
	return blocks.join("\n\n");
}

export default function AskScreenCommand(props: LaunchProps) {
	const initialQuery = props.fallbackText?.trim() ?? "";
	const {
		thread,
		history,
		runTurn,
		openThread,
		removeThread,
		clearAllThreads,
		stopStreaming,
	} = useChatController({});

	const [screenContext, setScreenContext] = useState<ScreenContext | null>(null);
	const [query, setQuery] = useState(initialQuery);

	useEffect(() => {
		let active = true;
		void captureScreenContext().then((ctx) => {
			if (active) setScreenContext(ctx);
		});
		return () => {
			active = false;
		};
	}, []);

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

	if (screenContext?.blocked) {
		return (
			<Detail
				navigationTitle="Ask Screen · Protected"
				markdown={buildContextPreviewMarkdown(screenContext)}
				actions={
					<ActionPanel>
						<Action
							title="Preferences"
							onAction={openExtensionPreferences}
						/>
					</ActionPanel>
				}
			/>
		);
	}

	const trimmed = query.trim();
	const previewMd = buildContextPreviewMarkdown(screenContext);
	const windowLabel = screenContext?.window?.className
		? `Ask about ${screenContext.window.className}...`
		: "Ask about what's on screen...";

	const submitPrompt = (promptText: string, useWeb: boolean) => {
		if (!promptText.trim() || !screenContext) return;
		setQuery("");
		void runTurn(promptText, "new", { screenContext, useWeb });
	};

	return (
		<List
			filtering={false}
			isShowingDetail
			isLoading={!screenContext}
			searchText={query}
			onSearchTextChange={setQuery}
			searchBarPlaceholder={windowLabel}
		>
			<List.Item
				id="ask-screen-custom"
				title={trimmed ? `Ask: "${trimmed}"` : "Type a question above..."}
				icon={{ source: Icon.Stars, tintColor: Color.Purple }}
				detail={<List.Item.Detail markdown={previewMd} />}
				actions={
					<ActionPanel>
						<Action
							title="Ask Screen"
							icon={Icon.ArrowRight}
							onAction={() =>
								submitPrompt(trimmed || QUICK_SCREEN_PROMPTS[0].query, false)
							}
						/>
						<Action
							title="Ask Screen + Web Search"
							icon={Icon.Globe01}
							shortcut={{ modifiers: ["ctrl"], key: "return" }}
							onAction={() =>
								submitPrompt(trimmed || QUICK_SCREEN_PROMPTS[0].query, true)
							}
						/>
						<Action
							title="Continue in Antigravity (agy)"
							icon={Icon.Terminal}
							shortcut={{ modifiers: ["ctrl", "shift"], key: "g" }}
							onAction={() =>
								void launchAgyHandoff({
									query: trimmed || QUICK_SCREEN_PROMPTS[0].query,
									screenContext: screenContext ?? undefined,
								})
							}
						/>
						<Action
							title="Preferences"
							onAction={openExtensionPreferences}
						/>
					</ActionPanel>
				}
			/>

			<List.Section title="Quick Actions">
				{QUICK_SCREEN_PROMPTS.map((preset) => (
					<List.Item
						key={preset.id}
						id={preset.id}
						title={preset.title}
						icon={Icon.SpeechBubble}
						detail={<List.Item.Detail markdown={previewMd} />}
						actions={
							<ActionPanel>
								<Action
									title="Ask Screen"
									icon={Icon.ArrowRight}
									onAction={() => submitPrompt(preset.query, false)}
								/>
								<Action
									title="Ask Screen + Web Search"
									icon={Icon.Globe01}
									shortcut={{ modifiers: ["ctrl"], key: "return" }}
									onAction={() => submitPrompt(preset.query, true)}
								/>
								<Action
									title="Continue in Antigravity (agy)"
									icon={Icon.Terminal}
									shortcut={{ modifiers: ["ctrl", "shift"], key: "g" }}
									onAction={() =>
										void launchAgyHandoff({
											query: preset.query,
											screenContext: screenContext ?? undefined,
										})
									}
								/>
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
		</List>
	);
}
