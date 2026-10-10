import { runCommand, trackLabel } from "./lib/command";
import { mutateAndRead } from "./lib/kaset";

export default async function Command() {
	await runCommand(
		async () => {
			const info = await mutateAndRead("play");
			const label = trackLabel(info.track, "");
			return `▶ Playing${label ? ` — ${label}` : ""}`;
		},
		{ launchIfNeeded: true },
	);
}
