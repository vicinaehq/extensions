import {
	Action,
	ActionPanel,
	Icon,
	openExtensionPreferences,
} from "@vicinae/api";
import { clearHistory, removeEntry } from "../services/history";
import type { EnhanceStyle, Mode } from "../types/index";
import { ENHANCE_STYLES, getEnhanceStyleLabel } from "../utils/index";
import ModelBrowserView from "./model-browser-view";
import type { ListItem } from "./ollama-view";

interface ItemActionsProps {
	item: ListItem;
	request: {
		output: string;
		isLoading: boolean;
		error: string | null;
		inputText: string;
		mode: Mode;
		enhanceStyle: EnhanceStyle;
	};
	ui: {
		showMetadata: boolean;
		historyEntries: unknown[];
	};
	handlers: {
		onStartRequest: () => void;
		onStopRequest: () => void;
		onSetInputText: (text: string) => void;
		onRefreshHistory: () => void;
		onSetShowMetadata: (v: boolean | ((prev: boolean) => boolean)) => void;
		onModelSelect: (model: string) => void;
		onSetEnhanceStyle: (style: EnhanceStyle) => void;
	};
}

export default function ItemActions({
	item,
	request,
	ui,
	handlers,
}: ItemActionsProps) {
	const { output, isLoading, error, inputText, mode, enhanceStyle } = request;
		const { showMetadata, historyEntries } = ui;
	const {
		onStartRequest,
		onStopRequest,
		onSetInputText,
		onRefreshHistory,
		onSetShowMetadata,
		onModelSelect,
		onSetEnhanceStyle,
	} = handlers;

	return (
		<ActionPanel>
			{item.type === "current" && output && (
				<>
					<Action.CopyToClipboard
						title="Copy Output"
						content={output}
						shortcut={{ modifiers: ["ctrl", "shift"], key: "c" }}
					/>
					<Action.CopyToClipboard
						title="Copy Input"
						content={inputText}
						shortcut={{ modifiers: ["ctrl", "shift"], key: "i" }}
					/>
					<Action.Paste
						title="Paste to Active App"
						content={output}
						shortcut={{ modifiers: ["ctrl", "shift"], key: "v" }}
					/>
				</>
			)}
			{item.type === "current" && inputText.trim() && (
				<Action
					title={isLoading ? "Stop" : "Regenerate"}
					icon={isLoading ? Icon.XMarkCircle : Icon.RotateAntiClockwise}
					shortcut={{ modifiers: ["ctrl"], key: "r" }}
					onAction={() => {
						if (isLoading || output) {
							onStopRequest();
						} else {
							onStartRequest();
						}
					}}
				/>
			)}
			{error && !isLoading && !output && (
				<Action
					title="Retry"
					icon={Icon.RotateAntiClockwise}
					shortcut={{ modifiers: ["ctrl"], key: "r" }}
					onAction={() => onStartRequest()}
				/>
			)}
			{error && (
				<Action
					title="Open Extension Preferences"
					icon={Icon.Cog}
					onAction={openExtensionPreferences}
				/>
			)}
			{item.type === "history" && item.entry && (
				<>
					<Action.CopyToClipboard
						title="Copy Output"
						content={item.output}
						shortcut={{ modifiers: ["ctrl", "shift"], key: "c" }}
					/>
					<Action.CopyToClipboard
						title="Copy Input"
						content={item.entry.input}
					/>
					<Action.Paste
						title="Paste to Active App"
						content={item.output}
						shortcut={{ modifiers: ["ctrl", "shift"], key: "v" }}
					/>
					<Action
						title="Use as Input"
						icon={Icon.TextInput}
						shortcut={{ modifiers: ["ctrl", "shift"], key: "i" }}
						onAction={() => onSetInputText(item.entry?.input ?? "")}
					/>
					<Action
						title="Delete Entry"
						icon={Icon.Trash}
						style={Action.Style.Destructive}
						shortcut={{ modifiers: ["ctrl", "shift"], key: "backspace" }}
						onAction={() => {
							if (item.entry) removeEntry(item.entry.id);
							onRefreshHistory();
						}}
					/>
				</>
			)}
			<Action.Push
				title="Select Model"
				icon={Icon.MagnifyingGlass}
				shortcut={{ modifiers: ["ctrl"], key: "m" }}
				target={<ModelBrowserView mode={mode} onSelect={onModelSelect} />}
			/>
			{mode === "enhance" && (
				<>
					<Action
						title={`Style: ${getEnhanceStyleLabel(enhanceStyle)}`}
						icon={Icon.Pencil}
						shortcut={{ modifiers: ["ctrl", "shift"], key: "s" }}
						onAction={() => {
							const currentIndex = ENHANCE_STYLES.findIndex((s) => s.value === enhanceStyle);
							const nextIndex = (currentIndex + 1) % ENHANCE_STYLES.length;
							onSetEnhanceStyle(ENHANCE_STYLES[nextIndex].value);
						}}
					/>
					<ActionPanel.Submenu title="Select Style">
						{ENHANCE_STYLES.map((s) => (
							<Action
								key={s.value}
								title={s.title}
								onAction={() => onSetEnhanceStyle(s.value)}
							/>
						))}
					</ActionPanel.Submenu>
				</>
			)}
			<Action
				title="Clear Input"
				icon={Icon.Trash}
				shortcut={{ modifiers: ["ctrl", "shift"], key: "x" }}
				onAction={() => {
					onSetInputText("");
					onStopRequest();
				}}
			/>
			{historyEntries.length > 0 && (
				<Action
					title="Clear All History"
					icon={Icon.XMarkCircle}
					style={Action.Style.Destructive}
					shortcut={{ modifiers: ["ctrl", "shift"], key: "delete" }}
					onAction={() => {
						clearHistory();
						onRefreshHistory();
					}}
				/>
			)}
			{output && (
				<Action
					title={showMetadata ? "Hide Metadata" : "Show Metadata"}
					icon={showMetadata ? Icon.EyeDisabled : Icon.Eye}
					shortcut={{ modifiers: ["ctrl", "shift"], key: "m" }}
					onAction={() => onSetShowMetadata((v) => !v)}
				/>
			)}
		</ActionPanel>
	);
}
