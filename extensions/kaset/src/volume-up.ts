import { runCommand } from "./lib/command";
import { settings } from "./lib/feedback";
import { clampVolume, getPlayerInfo, setVolumeAndRead } from "./lib/kaset";

export default async function Command() {
	await runCommand(async () => {
		const before = await getPlayerInfo();
		const info = await setVolumeAndRead(
			clampVolume(before.volume + settings().volumeStep),
		);
		return `🔊 Volume: ${info.volume}%`;
	});
}
