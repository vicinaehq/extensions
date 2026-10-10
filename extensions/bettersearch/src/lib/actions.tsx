import { dirname } from "node:path";
import {
	Action,
	ActionPanel,
	Clipboard,
	Icon,
	Keyboard,
	showToast,
	Toast,
} from "@vicinae/api";
import { fff } from "./daemon";
import { hasEditor, openDefault, openInEditor, openTerminalAt } from "./open";

type Props = {
	path: string;
	kind: "file" | "directory";
	trackQuery: string;
	line?: number;
	column?: number;
	/** Content matches open at their line, so the editor is the primary action. */
	preferEditor?: boolean;
	extraCopy?: { title: string; content: string };
	onTogglePreview: () => void;
};

async function rescan() {
	const toast = await showToast({
		style: Toast.Style.Animated,
		title: "Rescanning index",
	});
	try {
		await fff.rescan();
		toast.style = Toast.Style.Success;
		toast.title = "Rescan started";
	} catch (e) {
		toast.style = Toast.Style.Failure;
		toast.title = "Rescan failed";
		toast.message = e instanceof Error ? e.message : String(e);
	}
}

export function FileActions({
	path,
	kind,
	trackQuery,
	line,
	column,
	preferEditor = false,
	extraCopy,
	onTogglePreview,
}: Props) {
	const track = () => fff.track(trackQuery, path);

	const openAction = (
		<Action
			key="open"
			title={kind === "directory" ? "Open Folder" : "Open"}
			icon={kind === "directory" ? Icon.Folder : Icon.AppWindow}
			onAction={async () => {
				await track();
				await openDefault(path);
			}}
		/>
	);

	const editorAction =
		kind === "file" && hasEditor() ? (
			<Action
				key="editor"
				title={line ? `Open in Editor at Line ${line}` : "Open in Editor"}
				icon={Icon.Code}
				shortcut={{ modifiers: ["ctrl"], key: "e" }}
				onAction={async () => {
					await track();
					await openInEditor(path, line, column);
				}}
			/>
		) : null;

	const primary = preferEditor && editorAction
		? [editorAction, openAction]
		: [openAction, editorAction];

	const folder = kind === "directory" ? path : dirname(path);

	return (
		<ActionPanel>
			<ActionPanel.Section>
				{primary}
				<Action.OpenWith
					title="Open With…"
					path={path}
					shortcut={Keyboard.Shortcut.Common.OpenWith}
					onOpen={track}
				/>
				<Action.ShowInFinder
					path={path}
					shortcut={{ modifiers: ["ctrl", "shift"], key: "f" }}
					onShow={track}
				/>
				<Action
					title="Open Terminal Here"
					icon={Icon.Terminal}
					shortcut={{ modifiers: ["ctrl", "shift"], key: "t" }}
					onAction={() => openTerminalAt(folder)}
				/>
			</ActionPanel.Section>
			<ActionPanel.Section>
				{extraCopy ? (
					<Action.CopyToClipboard
						title={extraCopy.title}
						content={extraCopy.content}
						shortcut={{ modifiers: ["ctrl", "shift"], key: "l" }}
					/>
				) : null}
				<Action.CopyToClipboard
					title="Copy Path"
					content={line ? `${path}:${line}` : path}
					shortcut={{ modifiers: ["ctrl", "shift"], key: "c" }}
				/>
				<Action.CopyToClipboard
					title="Copy Name"
					content={path.split("/").pop() ?? path}
					shortcut={{ modifiers: ["ctrl", "shift"], key: "n" }}
				/>
				{kind === "file" ? (
					<Action
						title="Copy File"
						icon={Icon.CopyClipboard}
						shortcut={{ modifiers: ["ctrl", "shift"], key: "." }}
						onAction={async () => {
							await Clipboard.copy({ file: path });
							await showToast({ title: "File copied" });
						}}
					/>
				) : null}
			</ActionPanel.Section>
			<ActionPanel.Section>
				<Action
					title="Toggle Preview"
					icon={Icon.Eye}
					shortcut={{ modifiers: ["ctrl", "shift"], key: "p" }}
					onAction={onTogglePreview}
				/>
				<Action
					title="Rescan Index"
					icon={Icon.ArrowClockwise}
					shortcut={Keyboard.Shortcut.Common.Refresh}
					onAction={rescan}
				/>
			</ActionPanel.Section>
		</ActionPanel>
	);
}
