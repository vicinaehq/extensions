import { List } from "@vicinae/api";
import type { Mode } from "../types/index";
import { getEnhanceStyleLabel, getModeLabel } from "../utils/index";
import type { ListItem } from "./ollama-view";

interface MetadataConfig {
	show: boolean;
	mode: Mode;
}

interface ItemDetailProps {
	item: ListItem;
	metadata: MetadataConfig;
}

function formatTimestamp(ts: number): string {
	return new Date(ts).toLocaleString();
}

export default function ItemDetail({ item, metadata }: ItemDetailProps) {
	if (!metadata.show) return <List.Item.Detail markdown={detailMarkdown(item)} />;

	return (
		<List.Item.Detail
			markdown={detailMarkdown(item)}
			metadata={
				<List.Item.Detail.Metadata>
					{item.type === "history" && item.entry && (
						<List.Item.Detail.Metadata.Label
							title="Mode"
							text={getModeLabel(item.entry.mode)}
						/>
					)}
					{metadata.mode === "enhance" && item.enhanceStyle && (
						<List.Item.Detail.Metadata.Label
							title="Style"
							text={getEnhanceStyleLabel(item.enhanceStyle)}
						/>
					)}
					<List.Item.Detail.Metadata.Label title="Model" text={item.model} />
					<List.Item.Detail.Metadata.Label
						title="Target"
						text={item.targetLanguage}
					/>
					<List.Item.Detail.Metadata.Separator />
					<List.Item.Detail.Metadata.Label
						title="Created At"
						text={formatTimestamp(item.timestamp ?? Date.now())}
					/>
				</List.Item.Detail.Metadata>
			}
		/>
	);
}

function detailMarkdown(item: ListItem): string {
	return item.type === "history" && item.entry
		? `**Input**\n\n${item.entry.input}\n\n---\n\n**Output**\n\n${item.output}`
		: item.output;
}
