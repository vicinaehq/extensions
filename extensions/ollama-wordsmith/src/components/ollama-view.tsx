import { getPreferenceValues, List } from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOllamaRequest } from "../hooks/use-ollama-request";
import {
	addEntry,
	getCachedModel,
	getHistory,
	setCachedModel,
} from "../services/history";
import type { EnhanceStyle, ExtensionPreferences, HistoryEntry, Mode } from "../types/index";
import { LANGUAGES } from "../utils/constants";
import { getEnhanceStyleLabel, getModeLabel } from "../utils/index";
import ItemActions from "./item-actions";
import ItemDetail from "./item-detail";
import ModelBrowserView from "./model-browser-view";

const MESSAGES: Record<Mode, { loading: string; done: string }> = {
	translate: { loading: "Getting your translation...", done: "Got your translation!" },
	summarize: { loading: "Getting your summary...", done: "Got your summary!" },
	explain: { loading: "Getting your explanation...", done: "Got your explanation!" },
	enhance: { loading: "Rewriting in selected style...", done: "Rewritten!" },
	dictionary: { loading: "Looking up word...", done: "Got the dictionary entry!" },
};


interface Props {
	mode: Mode;
	initialText?: string;
}

export interface ListItem {
	id: string;
	type: "current" | "history";
	title: string;
	output: string;
	model: string;
	targetLanguage: string;
	timestamp?: number;
	entry?: HistoryEntry;
	enhanceStyle?: EnhanceStyle;
}

export default function OllamaView({ mode, initialText }: Props) {
	const prefs = getPreferenceValues<ExtensionPreferences>();

	const [needsSetup, setNeedsSetup] = useState(!getCachedModel(mode));
	const [inputText, setInputText] = useState(initialText || "");
	const [targetLanguage, setTargetLanguage] = useState(prefs.targetLanguage);
	const [enhanceStyle, setEnhanceStyle] = useState<EnhanceStyle>("professional");
	const [selectedModel, setSelectedModel] = useState<string | null>(null);
	const [showMetadata, setShowMetadata] = useState(true);
	const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
	const [completionMessage, setCompletionMessage] = useState<string | null>(null);
	const [responseTimestamp, setResponseTimestamp] = useState<number | null>(null);
	const [responseStyle, setResponseStyle] = useState<EnhanceStyle | null>(null);

	const refreshHistory = useCallback(() => setHistoryEntries(getHistory()), []);

	useEffect(() => { refreshHistory(); }, [refreshHistory]);

	const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearDoneTimer = useCallback(() => {
		if (doneTimerRef.current) {
			clearTimeout(doneTimerRef.current);
			doneTimerRef.current = null;
		}
	}, []);

	const {
		output,
		isLoading,
		error,
		resultModel,
		stopRequest,
		startRequest,
	} = useOllamaRequest(mode, inputText, targetLanguage, enhanceStyle, (result) => {
		setCompletionMessage(MESSAGES[result.mode].done);
		setResponseTimestamp(Date.now());
		setResponseStyle(mode === "enhance" ? enhanceStyle : null);
		clearDoneTimer();
		doneTimerRef.current = setTimeout(() => setCompletionMessage(null), 5000);
		addEntry(result.mode, result.input, result.output, result.model, result.targetLanguage);
		refreshHistory();
	});

	useEffect(() => {
		if (isLoading) { setCompletionMessage(null); setResponseTimestamp(null); setResponseStyle(null); clearDoneTimer(); }
	}, [isLoading, clearDoneTimer]);

	useEffect(() => {
		return () => clearDoneTimer();
	}, [clearDoneTimer]);

	const displayModel = resultModel || selectedModel || getCachedModel(mode) || prefs.defaultModel;

	const handleModelSelect = (modelName: string) => {
		setCachedModel(mode, modelName);
		setSelectedModel(modelName);
		if (inputText.trim()) startRequest();
	};

	const requestState = { output, isLoading, error, inputText, mode, enhanceStyle };
	const uiState = { showMetadata, historyEntries };
	const handlers = {
		onStartRequest: startRequest,
		onStopRequest: stopRequest,
		onSetInputText: setInputText,
		onRefreshHistory: refreshHistory,
		onSetShowMetadata: setShowMetadata,
		onModelSelect: handleModelSelect,
		onSetEnhanceStyle: setEnhanceStyle,
	};

	const metadataConfig = { show: showMetadata, mode };

	const currentItems: ListItem[] = [];
	if (isLoading || output) {
		currentItems.push({
			id: "current",
			type: "current",
			title: inputText.trim() || getModeLabel(mode),
			output,
			model: displayModel,
			targetLanguage,
			timestamp: responseTimestamp ?? Date.now(),
			enhanceStyle: responseStyle ?? undefined,
		});
	} else if (error && !output) {
		currentItems.push({
			id: "error",
			type: "current",
			title: "Error",
			output: error,
			model: displayModel,
			targetLanguage,
		});
	}

	const historyItems: ListItem[] = historyEntries.map<ListItem>((entry) => ({
		id: entry.id,
		type: "history",
		title: entry.input,
		output: entry.output,
		model: entry.model,
		targetLanguage: entry.targetLanguage,
		timestamp: entry.timestamp,
		entry,
		enhanceStyle: undefined,
	}));

	const hasItems = currentItems.length > 0 || historyItems.length > 0;

	const renderItem = (item: ListItem) => (
		<List.Item
			key={item.id}
			title={item.title}
			detail={<ItemDetail item={item} metadata={metadataConfig} />}
			actions={<ItemActions item={item} request={requestState} ui={uiState} handlers={handlers} />}
		/>
	);

	return needsSetup ? (
		<ModelBrowserView
			mode={mode}
			onSelect={(modelName) => {
				setCachedModel(mode, modelName);
				setNeedsSetup(false);
			}}
		/>
	) : (
		<List
			searchText={inputText}
			onSearchTextChange={setInputText}
			searchBarPlaceholder={`Enter text to ${mode === "translate" ? "translate" : mode === "dictionary" ? "look up" : mode}...`}
			filtering={false}
			isLoading={isLoading}
			isShowingDetail={hasItems}
			searchBarAccessory={
			<List.Dropdown tooltip="Target Language" value={targetLanguage} onChange={setTargetLanguage}>
				{LANGUAGES.map((lang) => (
					<List.Dropdown.Item key={lang.value} title={lang.value} value={lang.value} />
				))}
			</List.Dropdown>
		}
			navigationTitle={
				isLoading
					? mode === "enhance"
						? `Rewriting in ${getEnhanceStyleLabel(enhanceStyle)} style...`
						: MESSAGES[mode].loading
					: completionMessage
						?? `${getModeLabel(mode)}${mode === "enhance" ? ` (${getEnhanceStyleLabel(enhanceStyle)})` : ""} with ${displayModel}`
			}
		>
			{!hasItems ? (
				inputText.trim() ? (
					<List.EmptyView title="Ready" description="Waiting for you to stop typing..." />
				) : (
				<List.EmptyView
					title={getModeLabel(mode)}
					description={mode === "dictionary" ? "Type a word or short phrase in the search bar above to look up its definition." : `Type or paste text in the search bar above to ${mode === "translate" ? "translate it" : `${mode} it`}.`}
				/>
				)
			) : (
				<>
					{currentItems.map(renderItem)}
					{historyItems.length > 0 && (
						<List.Section title={`History ${historyItems.length}`}>
							{historyItems.map(renderItem)}
						</List.Section>
					)}
				</>
			)}
		</List>
	);
}
