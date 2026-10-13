import type { LaunchProps } from "@vicinae/api";
import { KasetError } from "./lib/applescript";
import { runCommand } from "./lib/command";
import { extractVideoId } from "./lib/format";
import { playVideo } from "./lib/kaset";

export default async function Command(
	props: LaunchProps<{ arguments: Arguments.PlayVideo }>,
) {
	const input = props.arguments?.video ?? "";

	await runCommand(
		async () => {
			const videoId = extractVideoId(input);
			if (!videoId) {
				throw new KasetError(
					"bad-argument",
					"That is not a video ID or a YouTube link.",
				);
			}

			await playVideo(videoId);
			return `▶ Playing ${videoId}`;
		},
		{ launchIfNeeded: true },
	);
}
