import {
	Action,
	ActionPanel,
	Grid,
	Icon,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { fetchByGenre, fetchGenres } from "./api";
import {
	ASPECT_RATIO,
	duplicateKey,
	getTitle,
	GRID_COLUMNS,
	mediaTypeLabel,
	posterSource,
	posterUrl,
} from "./helpers";
import Entity from "./entity";
import MediaActions from "./media-actions";
import type { Genre, MediaResult } from "./types";

interface GenreBrowserProps {
	serverUrl: string;
	cookie: string;
	mediaType: "movie" | "tv";
}

export default function GenreBrowser({
	serverUrl,
	cookie,
	mediaType,
}: GenreBrowserProps) {
	const [genres, setGenres] = useState<Genre[]>([]);
	const [results, setResults] = useState<MediaResult[]>([]);
	const [selectedGenre, setSelectedGenre] = useState<Genre | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const label = mediaTypeLabel(mediaType);

	useEffect(() => {
		(async () => {
			try {
				const list = await fetchGenres(serverUrl, cookie, mediaType);
				setGenres(list);
			} catch (error) {
				await showToast({
					style: Toast.Style.Failure,
					title: `Failed to load ${label.toLowerCase()} genres`,
					message: String(error),
				});
			}
			setIsLoading(false);
		})();
	}, [serverUrl, cookie, mediaType]);

	async function selectGenre(genre: Genre) {
		setSelectedGenre(genre);
		setIsLoading(true);
		try {
			const data = await fetchByGenre(serverUrl, cookie, mediaType, genre.id);
			setResults(data.results);
		} catch (error) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Failed to load results",
				message: String(error),
			});
		}
		setIsLoading(false);
	}

	if (!selectedGenre) {
		return (
			<List
				isLoading={isLoading}
				navigationTitle={`Browse ${label} Genres`}
				searchBarPlaceholder={`Search ${label.toLowerCase()} genres...`}
			>
				{genres.map((genre) => (
					<List.Item
						key={genre.id}
						title={genre.name}
						icon={Icon.Tag}
						actions={
							<ActionPanel>
								<Action
									title={`Browse ${genre.name}`}
									icon={Icon.Eye}
									onAction={() => selectGenre(genre)}
								/>
							</ActionPanel>
						}
					/>
				))}
			</List>
		);
	}

	return (
		<Grid
			isLoading={isLoading}
			navigationTitle={`${selectedGenre.name} - ${label}`}
			columns={GRID_COLUMNS}
			aspectRatio={ASPECT_RATIO}
			fit={Grid.Fit.Fill}
			inset={Grid.Inset.Small}
			searchBarPlaceholder={`Search ${selectedGenre.name.toLowerCase()} ${label.toLowerCase()}s...`}
		>
			{results.length === 0 && !isLoading && (
				<Grid.EmptyView
					icon={Icon.FilmStrip}
					title="No results found"
					description="Try a different genre"
				/>
			)}
			<Grid.Section title={selectedGenre.name}>
				{results.map((item) => {
					const title = getTitle(item);
					const poster = posterUrl(item.posterPath);
					return (
						<Grid.Item
							key={duplicateKey(item)}
							title={title}
							content={
								poster
									? posterSource(poster, title)
									: { source: Icon.FilmStrip }
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
