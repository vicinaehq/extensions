import { List } from "@vicinae/api";
import { useState } from "react";
import { type SearchFilters, searchPackages } from "./api";
import { useApi } from "./hooks";
import { PackageListItem } from "./package-list-item";
import { partitionAccountPackages } from "./utils";

export const FilteredPackageList = ({
	filters,
	navigationTitle,
	sectionTitle,
}: {
	filters: SearchFilters;
	navigationTitle: string;
	sectionTitle: string;
}) => {
	const [query, setQuery] = useState("");
	const { data, isLoading, error } = useApi(
		(signal) => searchPackages({ ...filters, q: query }, signal),
		[query, JSON.stringify(filters)],
	);

	const { main, accounts } = filters.category
		? { main: data?.results ?? [], accounts: [] }
		: partitionAccountPackages(data?.results ?? []);

	return (
		<List
			isLoading={isLoading}
			throttle
			navigationTitle={navigationTitle}
			searchBarPlaceholder="Search packages..."
			onSearchTextChange={setQuery}
		>
			{error ? (
				<List.EmptyView
					title="Failed to load packages"
					description={error.message}
				/>
			) : !isLoading && (data?.results.length ?? 0) === 0 ? (
				<List.EmptyView
					title="No packages found"
					description="No package matches your search."
				/>
			) : null}

			{data ? (
				<List.Section
					title={sectionTitle}
					subtitle={`${data.results.length} of ${data.totalCount}`}
				>
					{main.map((pkg) => (
						<PackageListItem key={pkg.id} pkg={pkg} />
					))}
				</List.Section>
			) : null}

			{accounts.length > 0 ? (
				<List.Section title="Users & Groups" subtitle={`${accounts.length}`}>
					{accounts.map((pkg) => (
						<PackageListItem key={pkg.id} pkg={pkg} />
					))}
				</List.Section>
			) : null}
		</List>
	);
};
