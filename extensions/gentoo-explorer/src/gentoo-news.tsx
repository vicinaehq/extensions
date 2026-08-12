import { Action, ActionPanel, Icon, Keyboard, List } from "@vicinae/api";
import { getNews } from "./api";
import { useApi } from "./hooks";

export default function GentooNews() {
	const {
		data: news,
		isLoading,
		error,
	} = useApi((signal) => getNews(signal), []);

	return (
		<List isLoading={isLoading} searchBarPlaceholder="Search news...">
			{error ? (
				<List.EmptyView
					title="Failed to load news"
					description={error.message}
				/>
			) : null}

			<List.Section title="Gentoo News">
				{news?.map((item) => (
					<List.Item
						key={item.id}
						title={item.title}
						subtitle={item.summary}
						icon={Icon.Rss}
						accessories={[{ text: new Date(item.publishedAt).toDateString() }]}
						actions={
							<ActionPanel>
								<Action.OpenInBrowser
									title="Open on Gentoo.org"
									icon={Icon.Globe01}
									url={item.url}
								/>
								<Action.CopyToClipboard
									title="Copy Link"
									content={item.url}
									shortcut={
										Keyboard.Shortcut.Common.Copy as Keyboard.Shortcut.Common
									}
								/>
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
		</List>
	);
}
