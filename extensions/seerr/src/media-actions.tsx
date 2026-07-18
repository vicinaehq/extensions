import {
	Action,
	ActionPanel,
	Clipboard,
	Icon,
	showToast,
	Toast,
} from "@vicinae/api";
import { requestMedia } from "./api";
import RequestForm from "./request-form";
import type { MediaResult } from "./types";
import { getTitle, mediaTypeKey } from "./helpers";

interface MediaActionsProps {
	item: MediaResult;
	serverUrl: string;
	cookie: string;
	showRequest?: boolean;
	showShare?: boolean;
}

export async function requestMovie(
	serverUrl: string,
	cookie: string,
	mediaId: number,
	title: string,
) {
	const toast = await showToast({
		style: Toast.Style.Animated,
		title: `Requesting ${title}...`,
	});
	try {
		await requestMedia(serverUrl, cookie, "movie", mediaId);
		toast.style = Toast.Style.Success;
		toast.title = `${title} requested successfully`;
	} catch (error) {
		toast.style = Toast.Style.Failure;
		toast.title = "Failed to request";
		toast.message = String(error);
	}
}

export default function MediaActions({
	item,
	serverUrl,
	cookie,
	showRequest = true,
	showShare = true,
}: MediaActionsProps) {
	const title = getTitle(item);
	const mediaUrl = `${serverUrl}/${mediaTypeKey(item.mediaType)}/${item.id}`;

	return (
		<>
			{showRequest &&
				(item.mediaType === "tv" ? (
					<Action.Push
						title="Request TV Show"
						icon={Icon.Plus}
						shortcut={{ modifiers: ["cmd"], key: "return" }}
						target={
							<RequestForm media={item} serverUrl={serverUrl} cookie={cookie} />
						}
					/>
				) : (
					<Action
						title="Request Movie"
						icon={Icon.Plus}
						shortcut={{ modifiers: ["cmd"], key: "return" }}
						onAction={() => requestMovie(serverUrl, cookie, item.id, title)}
					/>
				))}
			{showShare && (
				<ActionPanel.Submenu title="Share" icon={Icon.Link}>
					<Action.CopyToClipboard
						title="Copy Title"
						content={title}
						shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
					/>
					<Action.CopyToClipboard title="Copy Seerr URL" content={mediaUrl} />
					{item.overview && (
						<Action.CopyToClipboard
							title="Copy Overview"
							content={item.overview}
						/>
					)}
				</ActionPanel.Submenu>
			)}
			<Action.OpenInBrowser
				title="Open in Seerr"
				url={mediaUrl}
				shortcut={{ modifiers: ["cmd"], key: "o" }}
				icon={Icon.Globe01}
			/>
		</>
	);
}
