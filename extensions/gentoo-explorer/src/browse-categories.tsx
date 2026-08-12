import { Action, ActionPanel, Icon, Keyboard, List } from "@vicinae/api";
import { SITE_URL, getCategories } from "./api";
import { FilteredPackageList } from "./filtered-package-list";
import { useApi } from "./hooks";
import { singleLine } from "./utils";

export default function BrowseCategories() {
	const {
		data: categories,
		isLoading,
		error,
	} = useApi((signal) => getCategories(signal), []);

	const visible = categories?.filter((cat) => cat.count > 0) ?? [];

	return (
		<List isLoading={isLoading} searchBarPlaceholder="Search categories...">
			{error ? (
				<List.EmptyView
					title="Failed to load categories"
					description={error.message}
				/>
			) : !isLoading && visible.length === 0 ? (
				<List.EmptyView
					title="No categories"
					description="The package index returned no categories."
					icon={Icon.Folder}
				/>
			) : null}

			<List.Section title="Categories" subtitle={`${visible.length}`}>
				{visible.map((cat) => (
					<List.Item
						key={cat.name}
						title={cat.name}
						subtitle={singleLine(cat.description) || undefined}
						icon={Icon.Folder}
						accessories={[{ text: `${cat.count} packages` }]}
						actions={
							<ActionPanel>
								<Action.Push
									title="Show Packages"
									icon={Icon.Box}
									target={
										<FilteredPackageList
											filters={{ category: cat.name }}
											navigationTitle={`Packages in ${cat.name}`}
											sectionTitle={cat.name}
										/>
									}
								/>
								<Action.OpenInBrowser
									title="Open on Ebuilds.info"
									icon={Icon.Globe01}
									url={`${SITE_URL}/category/${cat.name}`}
									shortcut={
										Keyboard.Shortcut.Common.Open as Keyboard.Shortcut.Common
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
