import {
	Action,
	ActionPanel,
	Color,
	Detail,
	Icon,
	showToast,
	Toast,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { fetchMediaDetails, requestMedia } from "./api";
import {
	getTitle,
	getYear,
	formatRating,
	mediaTypeLabel,
	posterUrl,
} from "./helpers";
import Recommendations from "./recommendations";
import RequestForm from "./request-form";
import type { MediaDetails, MediaResult } from "./types";

interface EntityProps {
	media: MediaResult;
	serverUrl: string;
	cookie: string;
}

export default function Entity({ media, serverUrl, cookie }: EntityProps) {
	const [details, setDetails] = useState<MediaDetails | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const mediaType = media.mediaType;
	const title = getTitle(media);

	useEffect(() => {
		(async () => {
			setIsLoading(true);
			setLoadError(null);
			try {
				const result = await fetchMediaDetails(
					serverUrl,
					cookie,
					mediaType,
					media.id,
				);
				setDetails(result);
			} catch (error) {
				setLoadError(String(error));
			}
			setIsLoading(false);
		})();
	}, [media.id, mediaType, serverUrl, cookie]);

	if (isLoading) {
		return (
			<Detail
				markdown={`# ${title}

Loading details...`}
			/>
		);
	}

	if (loadError || !details) {
		return (
			<Detail
				markdown={`# ${title}

Failed to load details.

${loadError || ""}`}
			/>
		);
	}

	const poster = posterUrl(details.posterPath);
	const releaseYear = getYear(details);
	const rating = formatRating(details.voteAverage);

	const markdown = poster
		? `![${title}](${poster})

# ${title}

${details.overview || "No overview available."}`
		: `# ${title}

${details.overview || "No overview available."}`;

	return (
		<Detail
			markdown={markdown}
			navigationTitle={title}
			metadata={
				<Detail.Metadata>
					<Detail.Metadata.Label
						title="Type"
						text={mediaTypeLabel(mediaType)}
					/>
					{releaseYear && (
						<Detail.Metadata.Label title="Year" text={releaseYear} />
					)}
					<Detail.Metadata.Label title="Rating" text={rating} />
					<Detail.Metadata.Label
						title="Votes"
						text={details.voteCount?.toLocaleString() || "N/A"}
					/>
					{details.genres && details.genres.length > 0 && (
						<Detail.Metadata.TagList title="Genres">
							{details.genres.map((genre) => (
								<Detail.Metadata.TagList.Item
									key={genre.id}
									text={genre.name}
									color={Color.Blue}
								/>
							))}
						</Detail.Metadata.TagList>
					)}
					{details.status && (
						<Detail.Metadata.Label title="Status" text={details.status} />
					)}
				</Detail.Metadata>
			}
			actions={
				<ActionPanel>
					{mediaType === "tv" ? (
						<Action.Push
							title="Request TV Show"
							icon={Icon.Plus}
							shortcut={{ modifiers: ["shift"], key: "return" }}
							target={
								<RequestForm
									media={media}
									serverUrl={serverUrl}
									cookie={cookie}
								/>
							}
						/>
					) : (
						<Action
							title="Request Movie"
							icon={Icon.Plus}
							shortcut={{ modifiers: ["shift"], key: "return" }}
							onAction={async () => {
								const toast = await showToast({
									style: Toast.Style.Animated,
									title: `Requesting ${title}...`,
								});
								try {
									await requestMedia(serverUrl, cookie, "movie", details.id);
									toast.style = Toast.Style.Success;
									toast.title = `${title} requested successfully`;
								} catch (error) {
									toast.style = Toast.Style.Failure;
									toast.title = "Failed to request";
									toast.message = String(error);
								}
							}}
						/>
					)}
					<Action.Push
						title="View Recommendations"
						icon={Icon.Star}
						shortcut={{ modifiers: ["cmd"], key: "r" }}
						target={
							<Recommendations
								serverUrl={serverUrl}
								cookie={cookie}
								mediaType={mediaType}
								mediaId={details.id}
								title={title}
							/>
						}
					/>
					<ActionPanel.Submenu title="Share" icon={Icon.Link}>
						<Action.CopyToClipboard
							title="Copy Title"
							content={title}
							shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
						/>
						<Action.CopyToClipboard
							title="Copy Seerr URL"
							content={`${serverUrl}/${mediaType === "movie" ? "movie" : "tv"}/${details.id}`}
						/>
						{details.overview && (
							<Action.CopyToClipboard
								title="Copy Overview"
								content={details.overview}
							/>
						)}
					</ActionPanel.Submenu>
					<Action.OpenInBrowser
						title="Open in Seerr"
						url={`${serverUrl}/${mediaType === "movie" ? "movie" : "tv"}/${details.id}`}
						shortcut={{ modifiers: ["cmd"], key: "o" }}
						icon={Icon.Globe01}
					/>
				</ActionPanel>
			}
		/>
	);
}
