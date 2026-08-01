import { type LaunchProps, showToast, Toast } from "@vicinae/api";
import { openInFreeTube } from "./freetube";
import { searchUrl } from "./youtube";

export default async function SearchYouTube(
	props: LaunchProps<{ arguments: Arguments.Search }>,
) {
	const query = props.arguments.query?.trim() ?? "";

	if (!query) {
		await showToast({
			style: Toast.Style.Failure,
			title: "Empty query",
			message: "Please enter a search term",
		});
		return;
	}

	await openInFreeTube(searchUrl(query), `Searching "${query}" in FreeTube`);
}
