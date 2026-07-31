import { openInFreeTube } from "./freetube";

export default async function OpenHistory() {
	await openInFreeTube(
		"https://www.youtube.com/feed/history",
		"Opening History in FreeTube",
	);
}
