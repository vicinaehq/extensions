import {
	Action,
	ActionPanel,
	Alert,
	Color,
	confirmAlert,
	Form,
	Icon,
	List,
	showToast,
	Toast,
	useNavigation,
} from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import {
	type Bookmark,
	listBookmarks,
	removeBookmark,
	saveBookmark,
} from "./bookmark-store";
import { reportError } from "./errors";
import { openInFreeTube } from "./freetube";
import { KIND_LABELS, type YouTubeKind } from "./youtube";

type KindFilter = YouTubeKind | "all";

const KIND_COLORS: Record<YouTubeKind, Color> = {
	video: Color.Red,
	channel: Color.Blue,
	playlist: Color.Green,
	other: Color.Yellow,
};

const KIND_ICONS: Record<YouTubeKind, Icon> = {
	video: Icon.Video,
	channel: Icon.Person,
	playlist: Icon.AppWindowList,
	other: Icon.Bookmark,
};

const FILTERS: { value: KindFilter; title: string; icon: Icon }[] = [
	{ value: "all", title: "All Categories", icon: Icon.Bookmark },
	{ value: "video", title: "Videos", icon: KIND_ICONS.video },
	{ value: "channel", title: "Channels", icon: KIND_ICONS.channel },
	{ value: "playlist", title: "Playlists", icon: KIND_ICONS.playlist },
	{ value: "other", title: "Other Links", icon: KIND_ICONS.other },
];

export default function BookmarksView() {
	const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [filter, setFilter] = useState<KindFilter>("all");

	const refresh = useCallback(async () => {
		setIsLoading(true);
		try {
			setBookmarks(await listBookmarks());
		} catch (error) {
			await reportError("Couldn't load bookmarks", error);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const visible =
		filter === "all"
			? bookmarks
			: bookmarks.filter((bookmark) => bookmark.kind === filter);

	const addAction = (
		<Action.Push
			title="Add Bookmark"
			icon={Icon.Plus}
			shortcut="new"
			target={<AddBookmarkForm onSaved={refresh} />}
		/>
	);

	const handleRemove = async (bookmark: Bookmark) => {
		const confirmed = await confirmAlert({
			title: `Remove "${bookmark.name}"?`,
			icon: Icon.Trash,
			primaryAction: {
				title: "Remove",
				style: Alert.ActionStyle.Destructive,
			},
		});
		if (!confirmed) return;

		try {
			await removeBookmark(bookmark.id);
		} catch (error) {
			await reportError("Couldn't remove bookmark", error);
			return;
		}

		await showToast({
			style: Toast.Style.Success,
			title: "Bookmark removed",
			message: bookmark.name,
		});
		await refresh();
	};

	return (
		<List
			isLoading={isLoading}
			searchBarPlaceholder="Search saved bookmarks…"
			actions={<ActionPanel>{addAction}</ActionPanel>}
			searchBarAccessory={
				<List.Dropdown
					tooltip="Filter by Category"
					value={filter}
					onChange={(value) => setFilter(value as KindFilter)}
				>
					{FILTERS.map(({ value, title, icon }) => (
						<List.Dropdown.Item
							key={value}
							title={title}
							value={value}
							icon={icon}
						/>
					))}
				</List.Dropdown>
			}
		>
			{!isLoading && visible.length === 0 && (
				<List.EmptyView
					icon={{ source: Icon.Bookmark, tintColor: Color.SecondaryText }}
					title="No Bookmarks Found"
					description={
						filter === "all"
							? "Save a YouTube link with the Add Bookmark action."
							: `Nothing saved under "${KIND_LABELS[filter]}".`
					}
					actions={<ActionPanel>{addAction}</ActionPanel>}
				/>
			)}
			{visible.map((bookmark) => (
				<List.Item
					key={bookmark.id}
					icon={KIND_ICONS[bookmark.kind]}
					title={bookmark.name}
					subtitle={bookmark.url}
					keywords={[bookmark.url]}
					accessories={[
						{
							tag: {
								value: KIND_LABELS[bookmark.kind],
								color: KIND_COLORS[bookmark.kind],
							},
						},
					]}
					actions={
						<ActionPanel>
							<ActionPanel.Section>
								<Action
									title="Open in FreeTube"
									icon={Icon.Play}
									onAction={() =>
										openInFreeTube(
											bookmark.url,
											`Opening "${bookmark.name}" in FreeTube`,
										)
									}
								/>
								{addAction}
							</ActionPanel.Section>
							<ActionPanel.Section>
								<Action.CopyToClipboard
									title="Copy URL"
									content={bookmark.url}
									shortcut="copy"
								/>
								<Action.OpenInBrowser
									title="Open in Web Browser"
									url={bookmark.url}
								/>
							</ActionPanel.Section>
							<ActionPanel.Section>
								<Action
									title="Remove Bookmark"
									icon={Icon.Trash}
									style="destructive"
									shortcut="remove"
									onAction={() => handleRemove(bookmark)}
								/>
							</ActionPanel.Section>
						</ActionPanel>
					}
				/>
			))}
		</List>
	);
}

function AddBookmarkForm({ onSaved }: { onSaved: () => void }) {
	const { pop } = useNavigation();
	const [inputError, setInputError] = useState<string>();

	const handleSubmit = async (values: Form.Values) => {
		const input = String(values.input ?? "").trim();
		if (!input) {
			setInputError("Required");
			return;
		}

		let saved: Bookmark | null;
		try {
			saved = await saveBookmark(input, String(values.name ?? ""));
		} catch (error) {
			await reportError("Couldn't save bookmark", error);
			return;
		}

		if (!saved) {
			setInputError("Not a YouTube link, ID, @handle, or playlist ID");
			return;
		}

		await showToast({
			style: Toast.Style.Success,
			title: "Bookmark saved",
			message: saved.name,
		});
		onSaved();
		pop();
	};

	return (
		<Form
			navigationTitle="Add Bookmark"
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title="Save Bookmark"
						icon={Icon.Plus}
						onSubmit={handleSubmit}
					/>
				</ActionPanel>
			}
		>
			<Form.TextField
				id="input"
				title="YouTube URL or ID"
				placeholder="Paste URL, video ID, @handle, or playlist ID"
				autoFocus
				error={inputError}
				onChange={() => setInputError(undefined)}
			/>
			<Form.TextField
				id="name"
				title="Bookmark Name"
				placeholder="Optional — defaults to the video or channel ID"
			/>
		</Form>
	);
}
