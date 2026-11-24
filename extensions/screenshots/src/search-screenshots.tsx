import { access } from "node:fs/promises";
import { useCallback, useEffect, useState } from "react";
import {
	Action,
	ActionPanel,
	Alert,
	Clipboard,
	Grid,
	Icon,
	Keyboard,
	Toast,
	closeMainWindow,
	confirmAlert,
	getPreferenceValues,
	openExtensionPreferences,
	showHUD,
	showToast,
	trash,
} from "@vicinae/api";
import {
	type Screenshot,
	dayLabel,
	formatBytes,
	listScreenshots,
	resolveDirectory,
} from "./screenshots";
import { openFloatingPreview } from "./preview-window";

type Preferences = {
	screenshotsDirectory?: string;
	columns: string;
};

type LoadState =
	| { status: "loading"; screenshots: Screenshot[] }
	| { status: "loaded"; screenshots: Screenshot[] }
	| { status: "error"; screenshots: Screenshot[]; message: string };

export default function SearchScreenshots() {
	const { screenshotsDirectory, columns } = getPreferenceValues<Preferences>();
	const directory = screenshotsDirectory?.trim()
		? resolveDirectory(screenshotsDirectory)
		: undefined;

	const [state, setState] = useState<LoadState>({
		status: "loading",
		screenshots: [],
	});

	const reload = useCallback(async () => {
		if (!directory) return;
		setState((prev) => ({ status: "loading", screenshots: prev.screenshots }));
		try {
			setState({
				status: "loaded",
				screenshots: await listScreenshots(directory),
			});
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			setState({
				status: "error",
				screenshots: [],
				message:
					code === "ENOENT"
						? `${directory} does not exist.`
						: code === "ENOTDIR"
							? `${directory} is not a directory.`
							: String(error),
			});
		}
	}, [directory]);

	useEffect(() => {
		reload();
	}, [reload]);

	if (!directory) {
		return (
			<Grid>
				<Grid.EmptyView
					icon={Icon.Folder}
					title="No screenshots directory set"
					description="Choose the directory your screenshots are saved to."
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
			</Grid>
		);
	}

	const sections: { title: string; screenshots: Screenshot[] }[] = [];
	for (const screenshot of state.screenshots) {
		const title = dayLabel(screenshot.createdAt);
		const last = sections[sections.length - 1];
		if (last?.title === title) last.screenshots.push(screenshot);
		else sections.push({ title, screenshots: [screenshot] });
	}

	return (
		<Grid
			columns={Number(columns) || 2}
			// Taller than 16:9 so portrait (phone) screenshots get bigger; landscape ones stay width-bound.
			aspectRatio="4/3"
			fit={Grid.Fit.Contain}
			inset={Grid.Inset.Small}
			isLoading={state.status === "loading"}
			searchBarPlaceholder="Search screenshots..."
		>
			{state.status !== "loading" && (
				<Grid.EmptyView
					icon={state.status === "error" ? Icon.Warning : Icon.Image}
					title={
						state.status === "error"
							? "Cannot read screenshots"
							: "No screenshots found"
					}
					description={
						state.status === "error"
							? state.message
							: `No PNG, JPEG or WebP images in ${directory}.`
					}
					actions={
						<ActionPanel>
							<Action
								title="Refresh"
								icon={Icon.ArrowClockwise}
								shortcut={Keyboard.Shortcut.Common.Refresh}
								onAction={reload}
							/>
							<Action
								title="Open Extension Preferences"
								icon={Icon.Cog}
								onAction={openExtensionPreferences}
							/>
						</ActionPanel>
					}
				/>
			)}
			{sections.map((section) => (
				<Grid.Section
					key={section.title}
					title={section.title}
					subtitle={String(section.screenshots.length)}
				>
					{section.screenshots.map((screenshot) => (
						<Grid.Item
							key={screenshot.path}
							id={screenshot.path}
							content={{
								value: { source: screenshot.path, fallback: Icon.Image },
								tooltip: `${screenshot.name} · ${formatBytes(screenshot.bytes)}`,
							}}
							title={screenshot.createdAt.toLocaleTimeString(undefined, {
								hour: "2-digit",
								minute: "2-digit",
							})}
							subtitle={
								screenshot.size &&
								`${screenshot.size.width} × ${screenshot.size.height}`
							}
							keywords={[screenshot.name, section.title]}
							dragContent={{ file: screenshot.path }}
							actions={
								<ScreenshotActions screenshot={screenshot} onChanged={reload} />
							}
						/>
					))}
				</Grid.Section>
			))}
		</Grid>
	);
}

function ScreenshotActions({
	screenshot,
	onChanged,
}: {
	screenshot: Screenshot;
	onChanged: () => void;
}) {
	const file = screenshot.path;

	// The file may have been moved or deleted since the grid was loaded.
	const ensureExists = async () => {
		try {
			await access(file);
			return true;
		} catch {
			await showToast({
				style: Toast.Style.Failure,
				title: "Screenshot no longer exists",
				message: file,
			});
			onChanged();
			return false;
		}
	};

	return (
		<ActionPanel>
			<ActionPanel.Section>
				<Action
					title="Paste Screenshot"
					icon={Icon.CopyClipboard}
					onAction={async () => {
						if (!(await ensureExists())) return;
						// Close first so focus returns to the target window before pasting.
						await closeMainWindow();
						await Clipboard.paste({ file });
					}}
				/>
				<Action
					title="Copy Screenshot"
					icon={Icon.CopyClipboard}
					shortcut={Keyboard.Shortcut.Common.Copy}
					onAction={async () => {
						if (!(await ensureExists())) return;
						await Clipboard.copy({ file });
						await showHUD("Screenshot copied");
					}}
				/>
				<Action
					title="Show Full Preview"
					icon={Icon.Maximize}
					shortcut={{ modifiers: ["ctrl"], key: "y" }}
					onAction={async () => {
						if (!(await ensureExists())) return;
						try {
							await openFloatingPreview(file, screenshot.size);
						} catch (error) {
							await showToast({
								style: Toast.Style.Failure,
								title: "Could not open preview",
								message: String(error),
							});
							return;
						}
						await closeMainWindow();
					}}
				/>
			</ActionPanel.Section>
			<ActionPanel.Section>
				<Action.Open
					title="Open Screenshot"
					icon={Icon.Image}
					target={file}
					shortcut={Keyboard.Shortcut.Common.Open}
				/>
				<Action.OpenWith
					title="Open With..."
					path={file}
					shortcut={Keyboard.Shortcut.Common.OpenWith}
				/>
				<Action.ShowInFinder path={file} title="Show in File Browser" />
				<Action.CopyToClipboard
					title="Copy Path"
					content={file}
					shortcut={Keyboard.Shortcut.Common.CopyPath}
				/>
			</ActionPanel.Section>
			<ActionPanel.Section>
				<Action
					title="Move to Trash"
					icon={Icon.Trash}
					style="destructive"
					shortcut={Keyboard.Shortcut.Common.Remove}
					onAction={async () => {
						const confirmed = await confirmAlert({
							title: "Move screenshot to trash?",
							message: screenshot.name,
							primaryAction: {
								title: "Move to Trash",
								style: Alert.ActionStyle.Destructive,
							},
						});
						if (!confirmed) return;
						try {
							await trash(file);
							await showToast({
								style: Toast.Style.Success,
								title: "Moved to trash",
							});
						} catch (error) {
							await showToast({
								style: Toast.Style.Failure,
								title: "Could not move to trash",
								message: String(error),
							});
						}
						onChanged();
					}}
				/>
				<Action
					title="Refresh"
					icon={Icon.ArrowClockwise}
					shortcut={Keyboard.Shortcut.Common.Refresh}
					onAction={onChanged}
				/>
			</ActionPanel.Section>
		</ActionPanel>
	);
}
