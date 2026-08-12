import { Action, ActionPanel, Detail, Icon, List } from "@vicinae/api";
import { type NewsItem, getNews, getNewsArticle } from "./api";
import { useApi } from "./hooks";
import { htmlToMarkdown } from "./utils";

const NewsArticleView = ({ item }: { item: NewsItem }) => {
	const {
		data: article,
		isLoading,
		error,
	} = useApi((signal) => getNewsArticle(item.slug, signal), [item.slug]);

	const published = new Date(item.publishedAt).toDateString();
	const markdown = error
		? `# ${item.title}\n\nFailed to load article: ${error.message}`
		: [
				`# ${item.title}`,
				`*${published}*`,
				article ? htmlToMarkdown(article.contentHtml) : item.summary,
			].join("\n\n");

	return (
		<Detail
			navigationTitle={item.title}
			markdown={isLoading ? `# ${item.title}\n\nLoading...` : markdown}
			actions={
				<ActionPanel>
					<Action.OpenInBrowser
						title="Open on Gentoo.org"
						icon={Icon.Globe01}
						url={item.url}
					/>
					<Action.CopyToClipboard title="Copy Link" content={item.url} />
				</ActionPanel>
			}
		/>
	);
};

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
						icon={Icon.Rss}
						accessories={[{ text: new Date(item.publishedAt).toDateString() }]}
						actions={
							<ActionPanel>
								<Action.Push
									title="Read Article"
									icon={Icon.Text}
									target={<NewsArticleView item={item} />}
								/>
								<Action.OpenInBrowser
									title="Open on Gentoo.org"
									icon={Icon.Globe01}
									url={item.url}
								/>
								<Action.CopyToClipboard title="Copy Link" content={item.url} />
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
		</List>
	);
}
