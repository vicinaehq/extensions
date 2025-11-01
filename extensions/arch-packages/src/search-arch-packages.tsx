import {
	Action,
	ActionPanel,
	Icon,
	List,
	Toast,
	showToast,
} from "@vicinae/api";
import { useState } from "react";
import { bytesNumberToHumanString, getPkgName, getPkgUrl } from "./utils";
import { useAllSearch } from "./api";

/**
 * Command: Search Arch and AUR packages
 */
export default function SearchArchPackages() {
	const [searchText, setSearchText] = useState("");
	const [packageType, setPackageType] = useState<PackageType>("all");

	const { allPackages, isLoading, errors } = useAllSearch(
		searchText,
		packageType,
	);

	if (errors.length > 0) {
		showToast(
			Toast.Style.Failure,
			"Error searching for packages",
			errors.map((error) => error.message).join(", "),
		);
	}

	return (
		<List
			isShowingDetail
			isLoading={isLoading}
			onSearchTextChange={setSearchText}
			searchBarAccessory={
				<List.Dropdown
					tooltip="Select Package Type"
					storeValue={true}
					value={packageType}
					onChange={(value) => setPackageType(value as PackageType)}
				>
					<List.Dropdown.Item title="All" value="all" />
					<List.Dropdown.Item title="Arch Packages" value="apkg" />
					<List.Dropdown.Item title="AUR" value="aur" />
				</List.Dropdown>
			}
		>
			{allPackages.map((result) => (
				<List.Item
					key={getPkgName(result)}
					title={getPkgName(result)}
					subtitle={result.type === "apkg" ? result.repo : "AUR"}
					// TODO: not supported yet
					// accessories={[
					//   <List.Item.Accessory
					//     text={result.type === 'apkg' ? result.repo : 'AUR'}
					//   />,
					// ]}
					actions={<PackageAction pkg={result} />}
					detail={<PackageDetail pkg={result} />}
				/>
			))}

			<EmptyView
				searchText={searchText}
				isLoading={isLoading}
				packageType={packageType}
				pkgCount={allPackages.length}
				errors={errors}
			/>
		</List>
	);
}

function PackageDetail({ pkg }: { pkg: SearchResult }) {
	if (!pkg) return null;

	if (pkg.type === "apkg") {
		const content = `
# ${pkg.pkgname}

${pkg.pkgdesc}

${pkg.replaces.length > 0 ? `**Replaces:** ${pkg.replaces.join(", ")}` : ""}

${pkg.provides.length > 0 ? `**Provides:** ${pkg.provides.join(", ")}` : ""}

${pkg.conflicts.length > 0 ? `**Conflicts:** ${pkg.conflicts.join(", ")}` : ""}


${pkg.depends.length > 0 ? `**Dependencies:** ${pkg.depends.join(", ")}` : ""}

${
	pkg.optdepends.length > 0
		? `**Optional Dependencies:** ${pkg.optdepends.join(", ")}`
		: ""
}

${pkg.url ? `**Website:** [${pkg.url}](${pkg.url})` : ""}

**Size:** ${bytesNumberToHumanString(
			pkg.compressed_size,
		)} (compressed) | ${bytesNumberToHumanString(
			pkg.installed_size,
		)} (installed)

**Maintainers:** ${pkg.maintainers.join(", ")}

    `.trim();
		return (
			<List.Item.Detail
				markdown={content}
				metadata={
					<List.Item.Detail.Metadata>
						<List.Item.Detail.Metadata.Label
							title="Version"
							text={pkg.pkgver}
						/>
						<List.Item.Detail.Metadata.Label
							title="Last Updated"
							text={new Date(pkg.last_update).toLocaleDateString()}
						/>
						{pkg.flag_date ? (
							<List.Item.Detail.Metadata.Label
								icon={Icon.Warning}
								title="Flagged out of date on"
								text={new Date(pkg.flag_date).toLocaleDateString()}
							/>
						) : null}
					</List.Item.Detail.Metadata>
				}
			/>
		);
	}

	if (pkg.type === "aur") {
		const content = `
# ${pkg.Name}

${pkg.Description}

${pkg.URL ? `**Upstream:** [${pkg.URL}](${pkg.URL})` : ""}

${pkg.Maintainer ? `**Maintainer:** ${pkg.Maintainer}` : ""}
    `.trim();
		return (
			<List.Item.Detail
				markdown={content}
				metadata={
					<List.Item.Detail.Metadata>
						<List.Item.Detail.Metadata.Label
							title="Version"
							text={pkg.Version}
						/>
						<List.Item.Detail.Metadata.Label
							title="Votes"
							text={String(pkg.NumVotes)}
						/>
						<List.Item.Detail.Metadata.Label
							title="Popularity"
							text={String(pkg.Popularity)}
						/>
						<List.Item.Detail.Metadata.Label
							title="Last Modified"
							text={new Date(pkg.LastModified * 1000).toLocaleDateString()}
						/>
						{pkg.OutOfDate ? (
							<List.Item.Detail.Metadata.Label
								title="Flagged out of date on"
								text={new Date(pkg.OutOfDate * 1000).toLocaleDateString()}
							/>
						) : null}
					</List.Item.Detail.Metadata>
				}
			/>
		);
	}

	throw new Error("Invalid package type");
}

function PackageAction({ pkg }: { pkg: SearchResult }) {
	return (
		<ActionPanel>
			<Action.CopyToClipboard
				title="Copy Package Name"
				content={getPkgName(pkg)}
			/>
			<Action.OpenInBrowser
				title="Open in Browser"
				icon={Icon.Globe}
				url={getPkgUrl(pkg)}
			/>
			<Action.OpenInBrowser
				title="Open Upstream"
				icon={Icon.Globe}
				url={pkg.type === "apkg" ? pkg.url : pkg.URL}
			/>
		</ActionPanel>
	);
}

function EmptyView({
	searchText,
	isLoading,
	packageType,
	pkgCount,
	errors,
}: {
	searchText: string;
	isLoading: boolean;
	packageType: PackageType;
	pkgCount: number;
	errors: Error[];
}) {
	if (errors.length >= (packageType === "all" ? 2 : 1)) {
		return (
			<List.EmptyView
				title="Error"
				icon={Icon.XMarkCircle}
				description={errors.map((error) => error.message).join(", ")}
			/>
		);
	}

	if (pkgCount > 0) return null;

	if (!searchText) {
		return (
			<List.EmptyView
				title="Search"
				description={`Search for ${
					packageType === "all"
						? "Arch packages and AUR"
						: packageType === "apkg"
							? "Arch packages"
							: "AUR"
				}...`}
				icon={Icon.MagnifyingGlass}
			/>
		);
	}

	if (!isLoading) {
		return (
			<List.EmptyView
				title="No results found"
				description="Try searching for a different package"
				icon={Icon.XMarkCircle}
			/>
		);
	}

	return null;
}
