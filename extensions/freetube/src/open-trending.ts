import { openInFreeTube } from "./freetube";

export default async function OpenTrending() {
	await openInFreeTube(
		"https://www.youtube.com/feed/trending",
		"Opening Trending in FreeTube",
	);
}
