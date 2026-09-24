import { runCommand } from "./lib/command";
import { mutateAndRead } from "./lib/kaset";

export default async function Command() {
	await runCommand(async () => {
		const info = await mutateAndRead("likeTrack");
		return info.likeStatus === "liked" ? "👍 Liked" : "👍 Like removed";
	});
}
