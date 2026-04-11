import {
	Action,
	ActionPanel,
	Clipboard,
	Icon,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useCallback, useMemo } from "react";
import { TARGET_LANGUAGES } from "../constants";

import type { OllamaModel } from "../types";

interface TranslateListProps {
	searchText: string;
	setSearchText: (text: string) => void;
	targetLang: string;
	setTargetLang: (lang: string) => void;
	result: string;
	isLoading: boolean;
	modelsError: string | null;
	models: OllamaModel[];
	selectedModel: string;
	setSelectedModel: (model: string) => void;
	handleClear: () => void;
	languageLabel: string;
	ollamaStatus: string;
}

export function TranslateList({
	searchText,
	setSearchText,
	targetLang,
	setTargetLang,
	result,
	isLoading,
	modelsError,
	models,
	selectedModel,
	setSelectedModel,
	handleClear,
	languageLabel,
	ollamaStatus,
}: TranslateListProps) {
	const handleCopy = useCallback(async (content: string) => {
		await Clipboard.copy(content);
		await showToast(Toast.Style.Success, "Copied to clipboard!");
	}, []);

	const modelActions = useMemo(
		() =>
			models.length > 0 ? (
				models.map((model) => (
					<Action
						key={model.model}
						title={model.model}
						onAction={() => setSelectedModel(model.model)}
					/>
				))
			) : (
				<Action title="No models found - Check Ollama" onAction={() => {}} />
			),
		[models, setSelectedModel],
	);

	const itemMetadata = useMemo(
		() => (
			<>
				<List.Item.Detail.Metadata.Label title="Model" text={selectedModel} />
				<List.Item.Detail.Metadata.Label title="To" text={targetLang} />
				<List.Item.Detail.Metadata.Separator />
				<List.Item.Detail.Metadata.Label
					title="Original"
					text={
						searchText.substring(0, 100) +
						(searchText.length > 100 ? "..." : "")
					}
				/>
			</>
		),
		[selectedModel, targetLang, searchText],
	);

	const emptyViewIcon = modelsError
		? Icon.Warning
		: models.length > 0
			? Icon.Globe01
			: Icon.Hourglass;

	return (
		<List
			searchText={searchText}
			onSearchTextChange={setSearchText}
			searchBarPlaceholder="Enter text to translate..."
			navigationTitle={`Ollama Translate • ${ollamaStatus}`}
			isLoading={isLoading}
			isShowingDetail={true}
			searchBarAccessory={
				<List.Dropdown
					tooltip="Target Language"
					value={targetLang}
					onChange={setTargetLang}
				>
					{TARGET_LANGUAGES.map((lang) => (
						<List.Dropdown.Item
							key={lang.value}
							title={lang.title}
							value={lang.value}
						/>
					))}
				</List.Dropdown>
			}
			actions={
				<ActionPanel>
					<ActionPanel.Section>
						<Action
							title="Copy Translation"
							icon={Icon.CopyClipboard}
							onAction={() => handleCopy(result)}
						/>
						<Action title="Clear" icon={Icon.Trash} onAction={handleClear} />
					</ActionPanel.Section>
					<ActionPanel.Section title={`Model: ${selectedModel}`}>
						{modelActions}
					</ActionPanel.Section>
				</ActionPanel>
			}
		>
			{!searchText.trim() ? (
				<List.EmptyView
					icon={emptyViewIcon}
					title={
						modelsError
							? "Ollama Error"
							: models.length === 0
								? "No models found"
								: "Start typing to translate"
					}
					description={
						modelsError
							? "Check Ollama is running"
							: models.length === 0
								? "Download a model with: ollama pull <model>"
								: "Enter text in the search bar above"
					}
				/>
			) : result ? (
				<List.Item
					title={result}
					subtitle={languageLabel}
					icon={Icon.Globe01}
					detail={
						<List.Item.Detail markdown={result} metadata={itemMetadata} />
					}
					actions={
						<ActionPanel>
							<ActionPanel.Section>
								<Action.CopyToClipboard
									title="Copy Translation"
									content={result}
								/>
								<Action.CopyToClipboard
									title="Copy Original"
									content={searchText}
								/>
							</ActionPanel.Section>
							<ActionPanel.Section>
								<Action
									title="New Translation"
									icon={Icon.Trash}
									onAction={handleClear}
								/>
							</ActionPanel.Section>
						</ActionPanel>
					}
					accessories={[{ text: languageLabel }]}
				/>
			) : isLoading ? (
				<List.EmptyView icon={Icon.Hourglass} title="Translating..." />
			) : (
				<List.EmptyView icon={Icon.Warning} title="Translation failed" />
			)}
		</List>
	);
}
