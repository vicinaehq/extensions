import { Grid, type LaunchProps } from "@vicinae/api";
import { useState } from "react";
import { IconActions } from "./icon-actions";
import {
	getColumnsPreference,
	getIconColor,
	iconToImage,
	toDataUri,
	toSvg,
} from "./iconify-utils";
import { useIconSearch } from "./use-iconify";

export default function SearchIconsCommand({
	launchContext = {},
}: LaunchProps<{ launchContext?: { hex?: string } }>) {
	const [query, setQuery] = useState("");
	const { data, isLoading } = useIconSearch(query);
	const columns = getColumnsPreference();
	const iconColor = getIconColor(launchContext);

	return (
		<Grid
			columns={columns}
			inset={Grid.Inset.Medium}
			isLoading={isLoading}
			onSearchTextChange={setQuery}
			searchBarPlaceholder="Search all Iconify icons..."
		>
			<Grid.EmptyView
				title="No icons found"
				description={
					query.trim()
						? "Try another search term."
						: "Type to search the Iconify catalog."
				}
			/>
			{data.map((icon) => {
				const svg = toSvg(icon.body, icon.width, icon.height, iconColor);
				const dataUri = toDataUri(svg);

				return (
					<Grid.Item
						key={`${icon.set.id}:${icon.id}`}
						title={icon.id}
						subtitle={icon.set.title}
						keywords={[icon.set.id, icon.set.title]}
						content={iconToImage(icon, iconColor)}
						actions={<IconActions icon={icon} svg={svg} dataUri={dataUri} />}
					/>
				);
			})}
		</Grid>
	);
}
