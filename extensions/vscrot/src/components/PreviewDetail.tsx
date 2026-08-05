import { Action, ActionPanel, Detail, Icon } from "@vicinae/api";
import { execSync } from "node:child_process";
import { shellEscape } from "../backends/utils";

interface PreviewDetailProps {
	imagePath: string;
	suggestedName: string;
	subfolder: string;
	annotatorLabel: string | null;
	onSave: () => void;
	onCopy: () => void;
	onAnnotate: () => void;
	onRefreshPreview: () => void;
	onReshoot: () => void;
	onDiscard: () => void;
}

export function PreviewDetail({
	imagePath,
	suggestedName,
	subfolder,
	annotatorLabel,
	onSave,
	onCopy,
	onAnnotate,
	onRefreshPreview,
	onReshoot,
	onDiscard,
}: PreviewDetailProps) {
	let dimensions = "unknown";
	try {
		dimensions = execSync(`identify -format "%wx%h" "${shellEscape(imagePath)}"`)
			.toString()
			.trim();
	} catch {
		// imagemagick not installed - skip
	}

	return (
		<Detail
			markdown={`![Preview](${imagePath}?${Date.now()})`}
			navigationTitle="Screenshot Preview"
			actions={
				<ActionPanel>
					<ActionPanel.Section title="Primary Actions">
						<Action
							title="Save Screenshot"
							icon={Icon.SaveDocument}
							onAction={onSave}
						/>
						<Action
							title="Copy to Clipboard"
							icon={Icon.CopyClipboard}
							onAction={onCopy}
						/>
						{annotatorLabel && (
							<Action
								title={annotatorLabel}
								icon={Icon.Pencil}
								onAction={onAnnotate}
							/>
						)}
					</ActionPanel.Section>
					<ActionPanel.Section title="Other Options">
						<Action
							title="Refresh Preview"
							icon={Icon.ArrowClockwise}
							onAction={onRefreshPreview}
						/>
						<Action
							title="Reshoot"
							icon={Icon.RotateAntiClockwise}
							onAction={onReshoot}
						/>
						<Action
							title="Discard"
							icon={Icon.Trash}
							style={Action.Style.Destructive}
							onAction={onDiscard}
						/>
					</ActionPanel.Section>
				</ActionPanel>
			}
			metadata={
				<Detail.Metadata>
					<Detail.Metadata.Label
						title="Suggested Name"
						text={`${suggestedName}.png`}
					/>
					<Detail.Metadata.Label title="Dimensions" text={dimensions} />
					<Detail.Metadata.Separator />
					<Detail.Metadata.Label title="Folder" text={subfolder} />
				</Detail.Metadata>
			}
		/>
	);
}
