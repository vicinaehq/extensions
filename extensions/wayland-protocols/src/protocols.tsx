import { Action, ActionPanel, Color, ImageLike, List } from "@vicinae/api";
import { useProtocols } from "./hooks";
import { Source, Stability } from "./client";
import { spawnSync } from "node:child_process";

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
	const { protocols } = useProtocols();

	return (
		<List searchBarPlaceholder={"Search for protocols..."}>
			<List.Section title={"Wayland Protocols"}>
				{protocols.map((p) => (
					<List.Item
						key={p.id}
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
								<Action
									title="Open in browser"
									onAction={() => {
										const source = `https://wayland.app/protocols/${p.id}`;
										const res = spawnSync("xdg-open", [source], {
											stdio: "inherit",
										});

										console.log(res.error);
										console.log(res.output);
										console.log(res.stdout);
										console.log(res.stderr);
									}}
								/>
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
		</List>
	);
}
