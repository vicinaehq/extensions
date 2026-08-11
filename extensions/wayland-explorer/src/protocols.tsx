import {
	Action,
	ActionPanel,
	Color,
	Icon,
	type ImageLike,
	List,
} from "@vicinae/api";
import { useProtocols } from "./hooks";
import type { Source, Stability } from "./client";

function stabilityToColor(stability: Stability) {
	switch (stability) {
		case "stable":
			return Color.Green;
		case "staging":
			return Color.Blue;
		case "unstable":
			return Color.Orange;
		default:
			return Color.Red;
	}
}

function sourceToIcon(source: Source): ImageLike {
	switch (source) {
		case "kde-protocols":
			return { source: "kde.png", tintColor: Color.PrimaryText };
		case "cosmic-protocols":
			return { source: "cosmic.svg" };
		case "hyprland-protocols":
			return { source: "hyprland.svg" };
		default:
			return "wayland.svg";
	}
}

export default function Protocols() {
	const { protocols, error, isLoading } = useProtocols();

	return (
		<List
			isLoading={isLoading}
			searchBarPlaceholder={"Search for protocols..."}
		>
			{!error ? (
				<List.EmptyView
					title="No protocol matches your search"
					description="The protocol you are looking for may not yet be listed on wayland.app"
					icon={{ source: "wayland.svg" }}
					actions={
						<ActionPanel>
							<Action.OpenInBrowser
								title="Go to wayland.app"
								url={`https://wayland.app`}
							/>
						</ActionPanel>
					}
				/>
			) : (
				<List.EmptyView
					title="Failed to fetch protocols"
					description="wayland.app might be down or changed the format"
					icon={{ source: Icon.XMarkCircle, tintColor: Color.Red }}
					actions={
						<ActionPanel>
							<Action.OpenInBrowser
								title="Go to wayland.app"
								url={`https://wayland.app`}
							/>
						</ActionPanel>
					}
				/>
			)}
			<List.Section title={"Wayland Protocols"}>
				{protocols.map((p) => (
					<List.Item
						key={p.id}
						dragContent={{ urls: [new URL(p.url)] }}
						subtitle={p.source}
						icon={sourceToIcon(p.source)}
						title={p.name}
						keywords={[p.source, p.stability]}
						accessories={[
							{
								tag: {
									value: p.stability,
									color: {
										dark: stabilityToColor(p.stability),
										light: stabilityToColor(p.stability),
									},
								},
							},
						]}
						actions={
							<ActionPanel>
								<Action.OpenInBrowser title="Open in browser" url={p.url} />
								<Action.CopyToClipboard
									title="Copy protocol name"
									content={p.name}
								/>
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
		</List>
	);
}
