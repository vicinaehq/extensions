import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { useState } from "react";
import { RefreshAction } from "./components/RefreshAction";
import { UmbrielList } from "./components/UmbrielList";
import {
	compareStrings,
	formatBoolean,
	formatPosition,
	formatSize,
} from "./lib/format";
import { useUmbrielQuery } from "./lib/hooks";
import type { Layer } from "./lib/types";

const LAYER_ORDER: Record<string, number> = {
	background: 0,
	bottom: 1,
	top: 2,
	overlay: 3,
};

function layerRank(layer: string): number {
	return LAYER_ORDER[layer] ?? 99;
}

function layerTooltip(layer: string): string {
	switch (layer) {
		case "background":
			return "Background layer — wallpapers and backdrop content";
		case "bottom":
			return "Bottom layer — below normal windows";
		case "top":
			return "Top layer — panels and bars";
		case "overlay":
			return "Overlay layer — launchers, notifications, OSDs, and lock surfaces";
		default:
			return `Layer: ${layer}`;
	}
}

function keyboardTooltip(interactivity: string): string {
	switch (interactivity) {
		case "exclusive":
			return "exclusive — takes keyboard focus while mapped";
		case "on_demand":
			return "on-demand — can take keyboard focus when requested";
		default:
			return "none — never takes keyboard focus";
	}
}

function layerDetail(layer: Layer) {
	return (
		<List.Item.Detail
			metadata={
				<List.Item.Detail.Metadata>
					<List.Item.Detail.Metadata.Label
						title="Namespace"
						text={layer.namespace}
					/>
					<List.Item.Detail.Metadata.Label title="Output" text={layer.output} />
					<List.Item.Detail.Metadata.Label title="Layer" text={layer.layer} />
					<List.Item.Detail.Metadata.Label
						title="Mapped"
						text={formatBoolean(layer.mapped)}
					/>
					<List.Item.Detail.Metadata.Label
						title="Focused"
						text={formatBoolean(layer.focused)}
					/>
					<List.Item.Detail.Metadata.Label
						title="Keyboard Interactivity"
						text={layer.keyboard_interactivity}
					/>
					<List.Item.Detail.Metadata.Label title="PID" text={`${layer.pid}`} />
					<List.Item.Detail.Metadata.Separator />
					<List.Item.Detail.Metadata.Label
						title="Geometry"
						text={`${formatSize(layer.w, layer.h)} at ${formatPosition(layer.x, layer.y)}`}
					/>
					<List.Item.Detail.Metadata.Label
						title="Exclusive Zone"
						text={`${layer.exclusive_zone}`}
					/>
					<List.Item.Detail.Metadata.Label
						title="Anchor"
						text={layer.anchor.join(", ") || "—"}
					/>
					<List.Item.Detail.Metadata.Label
						title="Margin"
						text={`top ${layer.margin.top}, right ${layer.margin.right}, bottom ${layer.margin.bottom}, left ${layer.margin.left}`}
					/>
				</List.Item.Detail.Metadata>
			}
		/>
	);
}

export default function Layers() {
	const { data, loading, error, refresh } = useUmbrielQuery<Layer[]>("layers");
	const [showDetail, setShowDetail] = useState(false);
	const layers = [...(data ?? [])].sort(
		(a, b) =>
			compareStrings(a.output, b.output) ||
			layerRank(a.layer) - layerRank(b.layer) ||
			compareStrings(a.namespace, b.namespace) ||
			a.pid - b.pid,
	);

	return (
		<UmbrielList
			isLoading={loading}
			isEmpty={layers.length === 0}
			error={error}
			emptyTitle="No Layer Surfaces"
			emptyDescription="Umbriel reported no layer-shell surfaces."
			emptyIcon={Icon.Layers}
			searchBarPlaceholder="Search layer namespaces, outputs, and layers…"
			isShowingDetail={showDetail && layers.length > 0}
			onRefresh={refresh}
		>
			{layers.map((layer) => (
				<List.Item
					key={`${layer.namespace}:${layer.output}:${layer.layer}:${layer.pid}:${layer.x}:${layer.y}`}
					title={layer.namespace || "Unnamed Layer"}
					subtitle={`${layer.output} · ${formatSize(layer.w, layer.h)}`}
					icon={Icon.Layers}
					active={layer.focused}
					keywords={[
						layer.namespace,
						layer.output,
						layer.layer,
						`${layer.pid}`,
					]}
					accessories={[
						{
							tag: { value: layer.keyboard_interactivity },
							icon: Icon.Keyboard,
							tooltip: keyboardTooltip(layer.keyboard_interactivity),
						},
						{
							tag: { value: layer.layer },
							icon: Icon.Layers,
							tooltip: layerTooltip(layer.layer),
						},
						...(layer.exclusive_zone > 0
							? [
									{
										tag: { value: `zone ${layer.exclusive_zone}` },
										icon: Icon.AppWindowGrid2x2,
										tooltip: `Exclusive zone — reserves ${layer.exclusive_zone} logical pixels`,
									},
								]
							: []),
					]}
					detail={showDetail ? layerDetail(layer) : undefined}
					actions={
						<ActionPanel>
							<Action
								title={showDetail ? "Hide Details" : "Show Details"}
								icon={Icon.Text}
								shortcut={{ modifiers: ["cmd"], key: "i" }}
								onAction={() => setShowDetail((shown) => !shown)}
							/>
							<RefreshAction onRefresh={refresh} />
							<Action.CopyToClipboard
								title="Copy Namespace"
								content={layer.namespace}
								shortcut={{ modifiers: ["cmd"], key: "c" }}
							/>
							<Action.CopyToClipboard
								title="Copy Output"
								content={layer.output}
							/>
							<Action.CopyToClipboard
								title="Copy Layer"
								content={layer.layer}
							/>
							<Action.CopyToClipboard
								title="Copy Geometry"
								content={`${formatSize(layer.w, layer.h)} at ${formatPosition(layer.x, layer.y)}`}
							/>
						</ActionPanel>
					}
				/>
			))}
		</UmbrielList>
	);
}
