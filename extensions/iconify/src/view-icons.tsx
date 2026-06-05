import {
	Action,
	ActionPanel,
	Grid,
	Icon,
	type LaunchProps,
	showToast,
	Toast,
} from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";
import { IconActions } from "./icon-actions";
import type { IconSet } from "./iconify-types";
import {
	getColumnsPreference,
	getIconColor,
	getItemsPerPagePreference,
	iconToImage,
	toDataUri,
	toSvg,
} from "./iconify-utils";
import { resetIconifyCache, useIconSetIcons, useIconSets } from "./use-iconify";

const NavigationActions = ({
	page,
	totalPages,
	setPage,
}: {
	page: number;
	totalPages: number;
	setPage: React.Dispatch<React.SetStateAction<number>>;
}) => {
	if (totalPages <= 1) {
		return null;
	}

	return (
		<ActionPanel.Section title="Navigation">
			{page > 0 ? (
				<Action
					title="Previous Page"
					icon={Icon.ArrowLeftCircle}
					shortcut={{ modifiers: ["ctrl"], key: "arrowLeft" }}
					onAction={() => setPage((current) => Math.max(0, current - 1))}
				/>
			) : null}
			{page < totalPages - 1 ? (
				<Action
					title="Next Page"
					icon={Icon.ArrowRightCircle}
					shortcut={{ modifiers: ["ctrl"], key: "arrowRight" }}
					onAction={() =>
						setPage((current) => Math.min(totalPages - 1, current + 1))
					}
				/>
			) : null}
			{page > 0 ? (
				<Action
					title="First Page"
					icon={Icon.ArrowLeftCircleFilled}
					onAction={() => setPage(0)}
				/>
			) : null}
			{page < totalPages - 1 ? (
				<Action
					title="Last Page"
					icon={Icon.ArrowRightCircleFilled}
					onAction={() => setPage(totalPages - 1)}
				/>
			) : null}
		</ActionPanel.Section>
	);
};

const GridActions = ({
	onClearCache,
}: {
	onClearCache: () => Promise<void>;
}) => (
	<ActionPanel>
		<ActionPanel.Section>
			<Action.OpenInBrowser
				title="Open Iconify"
				icon={Icon.Globe01}
				url="https://iconify.design"
			/>
			<Action
				title="Clear Cache"
				icon={Icon.Trash}
				onAction={() => onClearCache()}
			/>
		</ActionPanel.Section>
	</ActionPanel>
);

export default function ViewIconsCommand({
	launchContext = {},
}: LaunchProps<{ launchContext?: { hex?: string } }>) {
	const {
		data: sets,
		isLoading: isSetsLoading,
		refresh: refreshSets,
	} = useIconSets();
	const [activeSetId, setActiveSetId] = useState<string>();
	const [filter, setFilter] = useState("");
	const [page, setPage] = useState(0);
	const columns = getColumnsPreference();
	const itemsPerPage = getItemsPerPagePreference();
	const iconColor = getIconColor(launchContext);

	useEffect(() => {
		if (!activeSetId && sets.length > 0) {
			setActiveSetId(sets[0].id);
		}
	}, [activeSetId, sets]);

	const activeSet = sets.find((set) => set.id === activeSetId) ?? sets[0];
	const {
		data: icons,
		isLoading: isIconsLoading,
		refresh: refreshIcons,
	} = useIconSetIcons(activeSet);

	const filteredIcons = useMemo(() => {
		const normalized = filter.trim().toLowerCase();
		if (!normalized) {
			return icons;
		}

		return icons.filter((icon) => icon.id.toLowerCase().includes(normalized));
	}, [filter, icons]);

	const totalPages = Math.max(
		1,
		Math.ceil(filteredIcons.length / itemsPerPage),
	);

	useEffect(() => {
		setPage((current) => Math.min(current, totalPages - 1));
	}, [totalPages]);

	const pagedIcons = filteredIcons.slice(
		page * itemsPerPage,
		(page + 1) * itemsPerPage,
	);

	const clearCache = async () => {
		resetIconifyCache();
		refreshSets();
		refreshIcons();
		await showToast(Toast.Style.Success, "Cache cleared");
	};

	return (
		<Grid
			columns={columns}
			inset={Grid.Inset.Medium}
			isLoading={isSetsLoading || isIconsLoading}
			onSearchTextChange={(text) => {
				setFilter(text);
				setPage(0);
			}}
			searchBarPlaceholder="Filter icons in the selected set..."
			searchBarAccessory={
				<Grid.Dropdown
					tooltip="Select icon set"
					storeValue
					value={activeSet?.id}
					onChange={(value) => {
						setActiveSetId(value);
						setPage(0);
					}}
				>
					{sets.map((set: IconSet) => (
						<Grid.Dropdown.Item
							key={set.id}
							title={set.name}
							value={set.id}
							keywords={[set.category, set.id]}
						/>
					))}
				</Grid.Dropdown>
			}
			actions={<GridActions onClearCache={clearCache} />}
		>
			<Grid.EmptyView
				title="No icons found"
				description={
					activeSet ? "Try another filter or icon set." : "Loading icon sets..."
				}
			/>
			<Grid.Section
				title={
					activeSet
						? `${activeSet.name} - page ${page + 1} of ${totalPages}`
						: "Icon Sets"
				}
				subtitle={
					activeSet ? `${filteredIcons.length} matching icons` : undefined
				}
			>
				{pagedIcons.map((icon) => {
					const svg = toSvg(icon.body, icon.width, icon.height, iconColor);
					const dataUri = toDataUri(svg);

					return (
						<Grid.Item
							key={`${icon.set.id}:${icon.id}`}
							title={icon.id}
							keywords={[icon.set.id, icon.set.title]}
							content={iconToImage(icon, iconColor)}
							actions={
								<IconActions icon={icon} svg={svg} dataUri={dataUri}>
									<NavigationActions
										page={page}
										totalPages={totalPages}
										setPage={setPage}
									/>
								</IconActions>
							}
						/>
					);
				})}
			</Grid.Section>
		</Grid>
	);
}
