import { Icon, List } from "@vicinae/api";
import { useState } from "react";
import {
	type PackageSummary,
	getLatestPackages,
	getOverlays,
	searchPackages,
} from "./api";
import { useApi } from "./hooks";
import { PackageListItem } from "./package-list-item";
import { partitionAccountPackages } from "./utils";

type Results = {
	title: string;
	subtitle?: string;
	packages: PackageSummary[];
	accounts: PackageSummary[];
};

export default function SearchPackages() {
	const [query, setQuery] = useState("");
	const [overlay, setOverlay] = useState("");

	const { data: overlays } = useApi((signal) => getOverlays(signal), []);

	const { data, isLoading, error } = useApi<Results>(
		async (signal) => {
			if (!query && !overlay) {
				const latest = await getLatestPackages(signal);
				return { title: "Recently Added", packages: latest, accounts: [] };
			}

			const res = await searchPackages({ q: query, overlay }, signal);
			const { main, accounts } = partitionAccountPackages(res.results);

			return {
				title: "Packages",
				subtitle: `${res.results.length} of ${res.totalCount}`,
				packages: main,
				accounts,
			};
		},
		[query, overlay],
	);

	const resultCount =
		(data?.packages.length ?? 0) + (data?.accounts.length ?? 0);

	const sortedOverlays = [...(overlays ?? [])].sort(
		(a, b) => b.packageCount - a.packageCount,
	);

	return (
		<List
			isLoading={isLoading}
			throttle
			searchBarPlaceholder="Search Gentoo packages (e.g. dev-vcs/git)..."
			onSearchTextChange={setQuery}
			searchBarAccessory={
				<List.Dropdown
					tooltip="Filter by overlay"
					value={overlay}
					onChange={setOverlay}
				>
					<List.Dropdown.Item title="All Overlays" value="" />
					{sortedOverlays.map((item) => (
						<List.Dropdown.Item
							key={item.name}
							title={item.name}
							value={item.name}
						/>
					))}
				</List.Dropdown>
			}
		>
			{error ? (
				<List.EmptyView title="Search failed" description={error.message} />
			) : !isLoading && resultCount === 0 ? (
				<List.EmptyView
					title="No packages found"
					description="No package matches your search."
					icon={Icon.MagnifyingGlass}
				/>
			) : null}

			{data ? (
				<List.Section title={data.title} subtitle={data.subtitle}>
					{data.packages.map((pkg) => (
						<PackageListItem key={pkg.id} pkg={pkg} />
					))}
				</List.Section>
			) : null}

			{data && data.accounts.length > 0 ? (
				<List.Section
					title="Users & Groups"
					subtitle={`${data.accounts.length}`}
				>
					{data.accounts.map((pkg) => (
						<PackageListItem key={pkg.id} pkg={pkg} />
					))}
				</List.Section>
			) : null}
		</List>
	);
}
