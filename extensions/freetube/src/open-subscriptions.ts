import { openInFreeTube } from "./freetube";

export default async function OpenSubscriptions() {
	await openInFreeTube(
		"https://www.youtube.com/feed/subscriptions",
		"Opening Subscriptions in FreeTube",
	);
}
