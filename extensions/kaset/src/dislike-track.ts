import { runCommand } from "./lib/command";
import { mutateAndRead } from "./lib/kaset";

export default async function Command() {
	await runCommand(async () => {
		const info = await mutateAndRead("dislikeTrack");
		return info.likeStatus === "disliked"
			? "👎 Disliked"
			: "👎 Dislike removed";
	});
}
