import {
	Action,
	ActionPanel,
	Grid,
	Icon,
	showToast,
	Toast,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { fetchRecommendations } from "./api";
import {
	ASPECT_RATIO,
	duplicateKey,
	getTitle,
	GRID_COLUMNS,
	posterSource,
	posterUrl,
} from "./helpers";
import Entity from "./entity";
import MediaActions from "./media-actions";
import type { MediaResult } from "./types";

interface RecommendationsProps {
	serverUrl: string;
	cookie: string;
	mediaType: "movie" | "tv";
	mediaId: number;
	title: string;
}

export default function Recommendations({
	serverUrl,
	cookie,
	mediaType,
	mediaId,
	title,
}: RecommendationsProps) {
	const [items, setItems] = useState<MediaResult[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		(async () => {
			try {
				const results = await fetchRecommendations(
					serverUrl,
					cookie,
					mediaType,
					mediaId,
				);
				setItems(results);
			} catch (error) {
				await showToast({
					style: Toast.Style.Failure,
					title: "Failed to load recommendations",
					message: String(error),
				});
			}
			setIsLoading(false);
		})();
	}, [serverUrl, cookie, mediaType, mediaId]);

	return (
		<Grid
			isLoading={isLoading}
			navigationTitle={`Recommendations: ${title}`}
			columns={GRID_COLUMNS}
			aspectRatio={ASPECT_RATIO}
			fit={Grid.Fit.Fill}
			inset={Grid.Inset.Small}
			searchBarPlaceholder="Search recommendations..."
		>
			{items.length === 0 && !isLoading && (
				<Grid.EmptyView
					icon={Icon.FilmStrip}
					title="No recommendations found"
				/>
			)}
			<Grid.Section title="Recommendations">
				{items.map((item) => {
					const name = getTitle(item);
					const poster = posterUrl(item.posterPath);
					return (
						<Grid.Item
							key={duplicateKey(item)}
							title={name}
							content={
								poster ? posterSource(poster, name) : { source: Icon.FilmStrip }
							}
							actions={
								<ActionPanel>
									<Action.Push
										title="View Details"
										icon={Icon.Eye}
										target={
											<Entity
												media={item}
												serverUrl={serverUrl}
												cookie={cookie}
											/>
										}
									/>
									<MediaActions
										item={item}
										serverUrl={serverUrl}
										cookie={cookie}
									/>
								</ActionPanel>
							}
						/>
					);
				})}
			</Grid.Section>
		</Grid>
	);
}
