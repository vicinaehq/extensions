import { runCommand, trackLabel } from "./lib/command";
import { changeTrack } from "./lib/kaset";

export default async function Command() {
	await runCommand(async () => {
		const info = await changeTrack("previousTrack");
		return `⏮ ${trackLabel(info.track, "Previous track")}`;
	});
}
