import { Action, ActionPanel, Color, Detail, Icon } from "@vicinae/api";
import { DEFAULT_MIRROR_OPTIONS } from "./types";
import type { ActiveMirrorSession, Output } from "./types";
import { buildTransform, cancelScreenMirror } from "./utils";

type Props = {
	outputs: Output[] | undefined;
	activeMirror: ActiveMirrorSession | null;
	setActiveMirror: React.Dispatch<
		React.SetStateAction<ActiveMirrorSession | null>
	>;
};

export default function ActiveMirrorUi({
	outputs,
	activeMirror,
	setActiveMirror,
}: Props) {
	const sourceOutput = outputs?.find((o) => o.name === activeMirror?.source);
	const targetOutput = outputs?.find((o) => o.name === activeMirror?.target);
	const options = { ...DEFAULT_MIRROR_OPTIONS, ...activeMirror?.options };

	const getModeString = (output?: Output) => {
		const current =
			output?.modes.find((m) => m.current) ||
			output?.modes.find((m) => m.preferred) ||
			output?.modes[0];
		if (!current) return "Unknown";
		return `${current.width}x${current.height}@${Math.round(current.refresh)}Hz`;
	};

	const sourceRes = getModeString(sourceOutput);
	const targetRes = getModeString(targetOutput);
	const transform = buildTransform(options.rotation, options.flip);
	const region = options.region.trim();

	return (
		<Detail
			markdown=""
			metadata={
				<Detail.Metadata>
					<Detail.Metadata.TagList title="Status">
						<Detail.Metadata.TagList.Item
							text="Mirroring Active"
							color={Color.Green}
							icon={Icon.CheckCircle}
						/>
					</Detail.Metadata.TagList>

					<Detail.Metadata.Separator />

					<Detail.Metadata.Label
						title="Source Output"
						text={`${activeMirror?.source} (${sourceOutput?.make || "Display"})`}
						icon={Icon.Monitor}
					/>
					<Detail.Metadata.Label
						title="Target Output"
						text={`${activeMirror?.target} (${targetOutput?.make || "Display"})`}
						icon={Icon.Monitor}
					/>

					<Detail.Metadata.Separator />

					<Detail.Metadata.Label title="Scaling" text={options.scaling} />
					<Detail.Metadata.Label
						title="Transform"
						text={transform === "normal" ? "None" : transform}
						icon={Icon.RotateClockwise}
					/>
					<Detail.Metadata.Label
						title="Cursor"
						text={options.showCursor ? "Shown" : "Hidden"}
						icon={Icon.Mouse}
					/>
					{region && (
						<Detail.Metadata.Label
							title="Region"
							text={region}
							icon={Icon.Crop}
						/>
					)}

					<Detail.Metadata.Separator />

					<Detail.Metadata.Label title="Source Resolution" text={sourceRes} />
					<Detail.Metadata.Label title="Target Resolution" text={targetRes} />
					<Detail.Metadata.Label
						title="Backend"
						text="wl-mirror"
						icon={Icon.Desktop}
					/>
				</Detail.Metadata>
			}
			actions={
				<ActionPanel>
					<Action
						title="Stop Screen Mirror"
						icon={Icon.Stop}
						style={Action.Style.Destructive}
						onAction={() => cancelScreenMirror(setActiveMirror)}
					/>
				</ActionPanel>
			}
		/>
	);
}
