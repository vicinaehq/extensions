import { runCommand } from "./lib/command";
import { mutateAndRead } from "./lib/kaset";

export default async function Command() {
	await runCommand(async () => {
		const info = await mutateAndRead("toggleShuffle");
		return info.shuffling ? "🔀 Shuffle on" : "➡ Shuffle off";
	});
}
