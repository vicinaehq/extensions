import { type LaunchProps, showToast, Toast } from "@vicinae/api";
import { openInFreeTube } from "./freetube";
import { KIND_LABELS, resolveYouTubeInput } from "./youtube";

export default async function Open(
	props: LaunchProps<{ arguments: Arguments.Open }>,
) {
	const target = resolveYouTubeInput(props.arguments.input ?? "");

	if (!target) {
		await showToast({
			style: Toast.Style.Failure,
			title: "Couldn't recognise input",
			message:
				"Paste a YouTube URL, video ID, @handle, channel ID, or playlist ID",
		});
		return;
	}

	await openInFreeTube(
		target.url,
		`Opening ${KIND_LABELS[target.kind].toLowerCase()} in FreeTube`,
	);
}
