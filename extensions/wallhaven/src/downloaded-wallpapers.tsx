import {
	Action,
	ActionPanel,
	Alert,
	confirmAlert,
	Grid,
	Icon,
} from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import {
	DownloadedWallpaper,
	getDownloadHistory,
	removeFromDownloadHistory,
	setAsWallpaper,
} from "./downloads";

function useDownloadHistory() {
	const [downloads, setDownloads] = useState<DownloadedWallpaper[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		getDownloadHistory()
			.then(setDownloads)
			.finally(() => setIsLoading(false));
	}, []);

	const remove = useCallback(async (entry: DownloadedWallpaper) => {
		await removeFromDownloadHistory(entry);
		setDownloads((prev) => prev.filter((d) => d.id !== entry.id));
	}, []);

	return { downloads, isLoading, remove };
}

type DownloadActionsProps = {
	download: DownloadedWallpaper;
	onRemove: (entry: DownloadedWallpaper) => void;
};

function DownloadActions({ download, onRemove }: DownloadActionsProps) {
	const confirmRemove = async () => {
		const confirmed = await confirmAlert({
			title: "Delete this wallpaper?",
			message: "The downloaded file will be removed from disk.",
			primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
		});
		if (confirmed) onRemove(download);
	};

	return (
		<ActionPanel>
			<Action
				title="Set as wallpaper"
				icon={Icon.Desktop}
				onAction={() => setAsWallpaper(download)}
			/>
			<ActionPanel.Section>
				<Action.OpenInBrowser
					icon={Icon.Link}
					title="Open on Wallhaven"
					url={download.url}
					shortcut={"open"}
				/>
				<Action.CopyToClipboard
					title="Copy wallpaper URL"
					content={download.source}
					shortcut={"copy"}
				/>
				<Action.CopyToClipboard
					title="Copy wallpaper ID"
					content={download.id}
				/>
				<Action
					title="Delete download"
					icon={Icon.Trash}
					onAction={confirmRemove}
					shortcut={"remove-all"}
				/>
			</ActionPanel.Section>
		</ActionPanel>
	);
}

export default function DownloadedWallpapers() {
	const { downloads, isLoading, remove } = useDownloadHistory();

	return (
		<Grid
			isLoading={isLoading}
			searchBarPlaceholder="Filter downloaded wallpapers..."
			fit={Grid.Fit.Contain}
			aspectRatio="16/9"
			columns={4}
		>
			<Grid.EmptyView
				title="No downloaded wallpapers"
				description="Wallpapers you download from the search command will show up here."
				icon={Icon.Image}
			/>
			{downloads.map((d) => (
				<Grid.Item
					key={d.id}
					title={d.resolution}
					subtitle={new Date(d.downloadedAt).toLocaleDateString()}
					keywords={[d.id, d.resolution]}
					content={{ source: d.file }}
					actions={<DownloadActions download={d} onRemove={remove} />}
				/>
			))}
		</Grid>
	);
}
