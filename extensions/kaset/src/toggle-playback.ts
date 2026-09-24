import { runCommand, trackLabel } from "./lib/command";
import { mutateAndRead } from "./lib/kaset";

export default async function Command() {
	await runCommand(
		async () => {
			const info = await mutateAndRead("playPause");
			const label = trackLabel(info.track, "");
			return info.state === "playing"
				? `▶ Playing${label ? ` — ${label}` : ""}`
				: `⏸ Paused${label ? ` — ${label}` : ""}`;
		},
		{ launchIfNeeded: true },
	);
}
