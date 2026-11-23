import { Action, ActionPanel, Color, Icon, List } from "@vicinae/api";
import { useState } from "react";
import { RefreshAction } from "./components/RefreshAction";
import { UmbrielList } from "./components/UmbrielList";
import { performAction } from "./lib/feedback";
import {
	compareStrings,
	currentMode,
	formatBoolean,
	formatOutputResolution,
	formatPosition,
	formatScale,
	formatSize,
	formatTransform,
} from "./lib/format";
import { useUmbrielQuery } from "./lib/hooks";
import type { Output } from "./lib/types";

function outputDetail(output: Output) {
	const mode = currentMode(output);

	return (
		<List.Item.Detail
			metadata={
				<List.Item.Detail.Metadata>
					<List.Item.Detail.Metadata.Label title="Name" text={output.name} />
					<List.Item.Detail.Metadata.Label
						title="Make"
						text={output.make || "—"}
					/>
					<List.Item.Detail.Metadata.Label
						title="Model"
						text={output.model || "—"}
					/>
					<List.Item.Detail.Metadata.Label
						title="Serial"
						text={output.serial || "—"}
					/>
					<List.Item.Detail.Metadata.Separator />
					<List.Item.Detail.Metadata.Label
						title="Enabled"
						text={formatBoolean(output.enabled)}
					/>
					<List.Item.Detail.Metadata.Label
						title="Mode"
						text={mode ? formatOutputResolution(output) : "No mode reported"}
					/>
					<List.Item.Detail.Metadata.Label
						title="Position"
						text={formatPosition(output.position.x, output.position.y)}
					/>
					<List.Item.Detail.Metadata.Label
						title="Logical Size"
						text={formatSize(
							output.logical_size.width,
							output.logical_size.height,
						)}
					/>
					<List.Item.Detail.Metadata.Label
						title="Usable Area"
						text={`${formatSize(output.usable_area.width, output.usable_area.height)} at ${formatPosition(output.usable_area.x, output.usable_area.y)}`}
					/>
					<List.Item.Detail.Metadata.Label
						title="Transform"
						text={formatTransform(output.transform)}
					/>
					<List.Item.Detail.Metadata.Label
						title="Scale"
						text={formatScale(output.scale)}
					/>
					<List.Item.Detail.Metadata.Label
						title="Adaptive Sync"
						text={output.adaptive_sync ?? "Unsupported"}
					/>
					<List.Item.Detail.Metadata.Label
						title="HDR"
						text={formatBoolean(output.hdr_active)}
					/>
				</List.Item.Detail.Metadata>
			}
		/>
	);
}

export default function Outputs() {
	const { data, loading, error, refresh } =
		useUmbrielQuery<Output[]>("outputs");
	const [showDetail, setShowDetail] = useState(false);

	const outputs = [...(data ?? [])].sort((a, b) =>
		compareStrings(a.name, b.name),
	);
	const enabledCount = outputs.filter((output) => output.enabled).length;

	const powerOffAll = () =>
		performAction("dpms-off", [], {
			success: "Powered off all monitors",
			refresh,
		});
	const globalActions = (
		<ActionPanel.Section title="Global Actions">
			<RefreshAction onRefresh={refresh} />
			<Action
				title="Power Off All Monitors"
				icon={Icon.Power}
				shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
				onAction={powerOffAll}
			/>
		</ActionPanel.Section>
	);

	return (
		<UmbrielList
			isLoading={loading}
			isEmpty={outputs.length === 0}
			error={error}
			emptyTitle="No Outputs Found"
			emptyDescription="Umbriel reported no connected outputs."
			emptyIcon={Icon.Monitor}
			emptyActions={globalActions}
			searchBarPlaceholder="Search outputs, models, and modes…"
			isShowingDetail={showDetail && outputs.length > 0}
			onRefresh={refresh}
		>
			{outputs.map((output) => {
				const mode = currentMode(output);
				const enabled = output.enabled;
				const resolution = enabled ? formatOutputResolution(output) : "";
				const subtitle = [output.make, resolution].filter(Boolean).join(" · ");

				return (
					<List.Item
						key={output.name}
						id={output.name}
						title={output.name}
						subtitle={subtitle}
						icon={Icon.Monitor}
						keywords={[
							output.name,
							output.make,
							output.model,
							output.config_name ?? "",
							output.description,
							mode ? formatOutputResolution(output) : "",
						].filter(Boolean)}
						accessories={
							enabled
								? [
										...(output.powered
											? []
											: [
													{
														tag: { value: "Off", color: Color.Orange },
														icon: Icon.Power,
													},
												]),
										{
											tag: { value: formatTransform(output.transform) },
											icon: Icon.RotateClockwise,
											tooltip: "Rotation",
										},
										{
											tag: { value: formatScale(output.scale) },
											icon: Icon.Ruler,
											tooltip: "Scale",
										},
									]
								: [
										{
											tag: { value: "Disabled", color: Color.Red },
											icon: Icon.EyeDisabled,
										},
									]
						}
						detail={showDetail ? outputDetail(output) : undefined}
						actions={
							<ActionPanel>
								{(!enabled || enabledCount > 1) && (
									<Action
										title={enabled ? "Disable Monitor" : "Enable Monitor"}
										icon={enabled ? Icon.EyeDisabled : Icon.Eye}
										shortcut={{ modifiers: ["cmd"], key: "d" }}
										onAction={() =>
											performAction(
												enabled ? "output-disable" : "output-enable",
												[output.name],
												{
													success: `${output.name} ${enabled ? "disabled" : "enabled"}`,
													refresh,
												},
											)
										}
									/>
								)}
								{enabled && (
									<Action
										title={
											output.powered ? "Power Off Output" : "Power On Output"
										}
										icon={Icon.Power}
										onAction={() =>
											performAction(
												output.powered ? "dpms-off" : "dpms-on",
												[output.name],
												{
													success: `${output.powered ? "Powered off" : "Powered on"} ${output.name}`,
													refresh,
												},
											)
										}
									/>
								)}
								<Action
									title={showDetail ? "Hide Details" : "Show Details"}
									icon={Icon.Text}
									shortcut={{ modifiers: ["cmd"], key: "i" }}
									onAction={() => setShowDetail((shown) => !shown)}
								/>
								{globalActions}
								<ActionPanel.Section title="Copy Information">
									<Action.CopyToClipboard
										title="Copy Monitor Name"
										icon={Icon.Monitor}
										content={output.name}
									/>
									<Action.CopyToClipboard
										title="Copy Model"
										icon={Icon.Cog}
										content={[output.make, output.model]
											.filter(Boolean)
											.join(" ")}
									/>
									<Action.CopyToClipboard
										title="Copy Resolution"
										icon={Icon.Ruler}
										content={resolution}
									/>
									{output.config_name && (
										<Action.CopyToClipboard
											title="Copy Config Name"
											icon={Icon.CopyClipboard}
											content={output.config_name}
										/>
									)}
								</ActionPanel.Section>
							</ActionPanel>
						}
					/>
				);
			})}
		</UmbrielList>
	);
}
