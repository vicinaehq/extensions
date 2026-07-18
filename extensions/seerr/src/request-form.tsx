import { Action, ActionPanel, Form, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { fetchMediaDetails, requestMedia } from "./api";
import type { MediaResult, Season } from "./types";

interface RequestFormProps {
	media: MediaResult;
	serverUrl: string;
	cookie: string;
}

export default function RequestForm({
	media,
	serverUrl,
	cookie,
}: RequestFormProps) {
	const [seasons, setSeasons] = useState<Season[]>([]);
	const [selectedSeasons, setSelectedSeasons] = useState<number[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const title = media.title || media.name || "Unknown";

	useEffect(() => {
		(async () => {
			try {
				const details = await fetchMediaDetails(
					serverUrl,
					cookie,
					"tv",
					media.id,
				);
				if (details.seasons) {
					setSeasons(details.seasons);
					setSelectedSeasons(
						details.seasons
							.filter((s) => s.seasonNumber > 0)
							.map((s) => s.seasonNumber),
					);
				}
			} catch (error) {
				await showToast({
					style: Toast.Style.Failure,
					title: "Failed to load seasons",
					message: String(error),
				});
			}
			setIsLoading(false);
		})();
	}, [media.id, serverUrl, cookie]);

	async function handleSubmit() {
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: `Requesting ${title}...`,
		});
		try {
			await requestMedia(serverUrl, cookie, "tv", media.id, selectedSeasons);
			toast.style = Toast.Style.Success;
			toast.title = `${title} requested successfully`;
		} catch (error) {
			toast.style = Toast.Style.Failure;
			toast.title = "Failed to request";
			toast.message = String(error);
		}
	}

	return (
		<Form
			isLoading={isLoading}
			navigationTitle={`Request: ${title}`}
			actions={
				<ActionPanel>
					<Action.SubmitForm title="Submit Request" onSubmit={handleSubmit} />
				</ActionPanel>
			}
		>
			<Form.Description
				title="TV Show"
				text={`Requesting seasons for ${title}`}
			/>
			{seasons.length === 0 && !isLoading && (
				<Form.Description
					title="No Seasons"
					text="No season data available for this title."
				/>
			)}
			{seasons
				.filter((s) => s.seasonNumber > 0)
				.map((season) => (
					<Form.Checkbox
						key={season.id}
						id={`season-${season.seasonNumber}`}
						title={`Season ${season.seasonNumber}`}
						label={season.name || `Season ${season.seasonNumber}`}
						value={selectedSeasons.includes(season.seasonNumber)}
						onChange={(checked) => {
							setSelectedSeasons((prev) =>
								checked
									? [...prev, season.seasonNumber]
									: prev.filter((n) => n !== season.seasonNumber),
							);
						}}
					/>
				))}
		</Form>
	);
}
