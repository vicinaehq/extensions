import {
	Action,
	ActionPanel,
	Icon,
	List,
	openExtensionPreferences,
} from "@vicinae/api";
import path from "node:path";
import type { CaptureBackend } from "../backends/types";
import type { AnnotatorBackend } from "../annotators/types";
import type { CaptureMode } from "../backends/types";
import { BackendPicker, AnnotatorPicker } from "./ToolPicker";

interface CaptureListProps {
	recentFiles: string[];
	supportedModes: CaptureMode[];
	activeBackend: CaptureBackend | null;
	activeAnnotator: AnnotatorBackend | null;
	installedBackends: CaptureBackend[];
	installedAnnotators: AnnotatorBackend[];
	onCapture: (mode: CaptureMode) => void;
	onRefresh: () => void;
	onCopyFile: (filePath: string) => void;
	onDeleteFile: (filePath: string) => void;
	onSelectBackend: (id: string) => void;
	onSelectAnnotator: (id: string) => void;
}

const CAPTURE_ITEMS: { mode: CaptureMode; title: string; icon: Icon }[] = [
	{ mode: "area", title: "Capture Area", icon: Icon.Crop },
	{ mode: "window", title: "Capture Window", icon: Icon.AppWindow },
	{ mode: "monitor", title: "Capture Monitor", icon: Icon.Monitor },
	{ mode: "full", title: "Capture All Monitors", icon: Icon.Layers },
];

export function CaptureList({
	recentFiles,
	supportedModes,
	activeBackend,
	activeAnnotator,
	installedBackends,
	installedAnnotators,
	onCapture,
	onRefresh,
	onCopyFile,
	onDeleteFile,
	onSelectBackend,
	onSelectAnnotator,
}: CaptureListProps) {
	const noTools = installedBackends.length === 0;

	return (
		<List
			searchBarPlaceholder="Select capture mode..."
			actions={
				<ActionPanel>
					<Action
						title="Refresh History"
						icon={Icon.ArrowClockwise}
						onAction={onRefresh}
					/>
				</ActionPanel>
			}
		>
			{noTools ? (
				<List.EmptyView
					title="No screenshot tools installed"
					description="Open 'Manage Tools' to see what to install, or open Extension Preferences to configure a tool manually."
					icon={Icon.Camera}
					actions={
						<ActionPanel>
							<Action
								title="Open Extension Preferences"
								icon={Icon.Cog}
								onAction={openExtensionPreferences}
							/>
						</ActionPanel>
					}
				/>
			) : (
				<>
					<List.Section title="Capture Options">
						{CAPTURE_ITEMS.filter((item) =>
							supportedModes.includes(item.mode),
						).map((item) => (
							<List.Item
								key={item.mode}
								icon={item.icon}
								title={item.title}
								actions={
									<ActionPanel>
										<Action
											title={item.title}
											onAction={() => onCapture(item.mode)}
										/>
									</ActionPanel>
								}
							/>
						))}
					</List.Section>

					<List.Section title="Active Tools">
						<List.Item
							icon={Icon.Cog}
							title={`Capture: ${activeBackend?.displayName ?? "None"}`}
							subtitle={
								installedBackends.length > 1
									? `${installedBackends.length} tools available`
									: "1 tool available"
							}
							actions={
								<ActionPanel>
									<Action.Push
										title="Change Capture Tool"
										icon={Icon.ArrowClockwise}
										target={
											<BackendPicker
												available={installedBackends}
												currentId={activeBackend?.id ?? null}
												onSelect={onSelectBackend}
											/>
										}
									/>
									<Action
										title="Open Extension Preferences"
										icon={Icon.Cog}
										onAction={openExtensionPreferences}
									/>
								</ActionPanel>
							}
						/>
						<List.Item
							icon={Icon.Pencil}
							title={`Annotate: ${activeAnnotator?.displayName ?? "None"}`}
							subtitle={
								activeAnnotator?.mode === "auto"
									? "Auto-reload"
									: activeAnnotator?.mode === "manual"
										? "Manual save"
										: "Disabled"
							}
							actions={
								<ActionPanel>
									<Action.Push
										title="Change Annotation Tool"
										icon={Icon.ArrowClockwise}
										target={
											<AnnotatorPicker
												available={installedAnnotators}
												currentId={activeAnnotator?.id ?? null}
												onSelect={onSelectAnnotator}
											/>
										}
									/>
									<Action
										title="Open Extension Preferences"
										icon={Icon.Cog}
										onAction={openExtensionPreferences}
									/>
								</ActionPanel>
							}
						/>
					</List.Section>

					{recentFiles.length > 0 && (
						<List.Section title="Recent Screenshots">
							{recentFiles.map((file) => (
								<List.Item
									key={file}
									title={path.basename(file)}
									icon={file}
									subtitle={path.dirname(file).split("/").pop()}
									actions={
										<ActionPanel>
											<Action.Open title="Open Image" target={file} />
											<Action.ShowInFinder
												title="Show in File Manager"
												path={file}
											/>
											<Action
												title="Copy to Clipboard"
												icon={Icon.CopyClipboard}
												onAction={() => onCopyFile(file)}
											/>
											<Action
												title="Delete"
												icon={Icon.Trash}
												style={Action.Style.Destructive}
												onAction={() => onDeleteFile(file)}
											/>
										</ActionPanel>
									}
								/>
							))}
						</List.Section>
					)}
				</>
			)}
		</List>
	);
}
