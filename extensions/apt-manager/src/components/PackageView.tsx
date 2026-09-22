import { Color, Icon, List } from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";
import type { AptPackage, PackageListKind } from "../lib/apt";
import { fetchPackageList, flathubAppFromListed } from "../lib/apt";
import { PackageActions } from "./PackageActions";
import { AptAppDetail, FlathubAppDetail } from "./PackageListItemDetail";

const PAGE_START = 500;
const PAGE_STEP = 1000;

type Props = {
	kind: PackageListKind;
	title: string;
	emptyTitle: string;
};

export function PackageView({ kind, title, emptyTitle }: Props) {
	const [packages, setPackages] = useState<AptPackage[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [reloadKey, setReloadKey] = useState(0);
	const [query, setQuery] = useState("");
	const [visible, setVisible] = useState(PAGE_START);
	const [showingDetail, setShowingDetail] = useState(false);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setPackages(null);
		setError(null);
		fetchPackageList(kind)
			.then((list) => {
				if (!cancelled) setPackages(list);
			})
			.catch((reason: unknown) => {
				if (!cancelled) {
					setError(reason instanceof Error ? reason.message : String(reason));
				}
			});
		return () => {
			cancelled = true;
		};
	}, [kind, reloadKey]);

	useEffect(() => {
		setVisible(PAGE_START);
	}, [query]);

	const filtered = useMemo(() => {
		if (!packages) return [];
		const q = query.trim().toLowerCase();
		if (q === "") return packages;
		return packages.filter(
			(pkg) =>
				pkg.name.toLowerCase().includes(q) ||
				pkg.arch.includes(q) ||
				pkg.suite.includes(q),
		);
	}, [packages, query]);

	const isLoading = packages === null;
	const hasMore = filtered.length > visible;

	const refresh = () => setReloadKey((value) => value + 1);

	return (
		<List
			isLoading={isLoading}
			navigationTitle={title}
			searchBarPlaceholder="Search packages..."
			filtering={false}
			searchText={query}
			onSearchTextChange={setQuery}
			isShowingDetail={showingDetail}
			onSelectionChange={setSelectedId}
			pagination={{
				hasMore,
				onLoadMore: () => setVisible((value) => value + PAGE_STEP),
			}}
		>
			{error ? (
				<List.EmptyView
					icon={Icon.Exclamationmark}
					title="Failed to load packages"
					description={error}
				/>
			) : !isLoading && filtered.length === 0 ? (
				<List.EmptyView
					title={emptyTitle}
					description={query ? `No packages match "${query}".` : undefined}
				/>
			) : (
				filtered.slice(0, visible).map((pkg) => {
					const id = `${pkg.name}/${pkg.arch}`;
					return (
						<List.Item
							key={id}
							id={id}
							title={pkg.name}
							subtitle={pkg.version + (pkg.arch ? ` (${pkg.arch})` : "")}
							keywords={[pkg.suite]}
							icon={
								pkg.icon ??
								(pkg.manager === "flatpak" ? Icon.AppWindow : undefined)
							}
							accessories={accessoriesFor(kind, pkg)}
							detail={
								pkg.manager === "flatpak" ? (
									<FlathubAppDetail
										app={flathubAppFromListed(pkg)}
										enabled={showingDetail && selectedId === id}
									/>
								) : (
									<AptAppDetail
										pkg={pkg}
										enabled={showingDetail && selectedId === id}
									/>
								)
							}
							actions={
								<PackageActions
									kind={kind}
									pkg={pkg}
									onRefresh={refresh}
									onToggleDetail={() => setShowingDetail((value) => !value)}
								/>
							}
						/>
					);
				})
			)}
		</List>
	);
}

function accessoriesFor(
	kind: PackageListKind,
	pkg: AptPackage,
): List.Item.Accessory[] {
	if (pkg.manager === "flatpak") {
		return [
			{
				tag: {
					color: pkg.flags.installed ? Color.Green : Color.Blue,
					value: "flathub",
				},
			},
		];
	}
	if (kind === "upgradable") {
		return [
			{
				tag: {
					color: Color.Orange,
					value: `${pkg.current ?? "?"} → ${pkg.version}`,
				},
			},
		];
	}
	if (kind === "installed") {
		return [{ tag: { color: Color.Green, value: "installed" } }];
	}
	if (pkg.flags.installed)
		return [{ tag: { color: Color.Green, value: "installed" } }];
	if (pkg.flags.upgradable)
		return [{ tag: { color: Color.Orange, value: "upgradable" } }];
	return [];
}
