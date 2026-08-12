import { Action, ActionPanel, Color, Icon, Keyboard, List } from "@vicinae/api";
import { type Overlay, getOverlays, overlayUrl } from "./api";
import { FilteredPackageList } from "./filtered-package-list";
import { useApi } from "./hooks";
import { overlayColor, singleLine } from "./utils";

const qualityColor = (quality: string | null): Color => {
	switch (quality) {
		case "core":
		case "official":
			return Color.Green;
		case "stable":
			return Color.Blue;
		case "testing":
			return Color.Yellow;
		default:
			return Color.SecondaryText;
	}
};

const OverlayItem = ({ overlay }: { overlay: Overlay }) => (
	<List.Item
		title={overlay.name}
		subtitle={singleLine(overlay.description) || undefined}
		icon={{ source: Icon.Layers, tintColor: overlayColor(overlay.name) }}
		accessories={[
			...(overlay.quality && overlay.quality !== "experimental"
				? [
						{
							tag: {
								value: overlay.quality,
								color: qualityColor(overlay.quality),
							},
						},
					]
				: []),
			{ text: `${overlay.packageCount} packages` },
		]}
		actions={
			<ActionPanel>
				<Action.Push
					title="Show Packages"
					icon={Icon.Box}
					target={
						<FilteredPackageList
							filters={{ overlay: overlay.name }}
							navigationTitle={`Packages in ${overlay.name}`}
							sectionTitle={overlay.name}
						/>
					}
				/>
				<Action.OpenInBrowser
					title="Open on Ebuilds.info"
					icon={Icon.Globe01}
					url={overlayUrl(overlay.name)}
					shortcut={Keyboard.Shortcut.Common.Open as Keyboard.Shortcut.Common}
				/>
				{overlay.homepage?.startsWith("http") ? (
					<Action.OpenInBrowser
						title="Open Homepage"
						icon={Icon.Link}
						url={overlay.homepage}
					/>
				) : null}
			</ActionPanel>
		}
	/>
);

export default function BrowseOverlays() {
	const {
		data: overlays,
		isLoading,
		error,
	} = useApi((signal) => getOverlays(signal), []);

	const sorted = [...(overlays ?? [])].sort(
		(a, b) => b.packageCount - a.packageCount,
	);

	return (
		<List isLoading={isLoading} searchBarPlaceholder="Search overlays...">
			{error ? (
				<List.EmptyView
					title="Failed to load overlays"
					description={error.message}
				/>
			) : !isLoading && sorted.length === 0 ? (
				<List.EmptyView
					title="No overlays"
					description="The overlay index returned no overlays."
					icon={Icon.Layers}
				/>
			) : null}

			<List.Section title="Overlays" subtitle={`${sorted.length}`}>
				{sorted.map((overlay) => (
					<OverlayItem key={overlay.id} overlay={overlay} />
				))}
			</List.Section>
		</List>
	);
}
