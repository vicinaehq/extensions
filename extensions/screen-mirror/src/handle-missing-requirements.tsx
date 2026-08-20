import { Action, ActionPanel, Detail, Icon } from "@vicinae/api";

const WL_MIRROR_NOT_FOUND = `## wl-mirror not installed
wl-mirror is required for this extension to work.
### Installation Instructions 
##### Arch Linux
  sudo pacman -S wl-mirror
##### Ubuntu/Debian
  sudo apt install wl-mirror
##### Fedora
  sudo dnf install wl-mirror
`;

const WLR_RANDR_NOT_FOUND = `## wlr-randr not installed
wlr-randr is required to manage outputs for a wayland compositor.
### Installation Instructions 
##### Arch Linux
  sudo pacman -S wlr-randr
##### Ubuntu/Debian
  sudo apt install wlr-randr 
##### Fedora
  sudo dnf install wlr-randr
`;

const MONITORS_REQ_NOT_MET = `## Not enough monitors connected 
You need at least two monitors one for source and one for target to start screen mirroring. Please connect at least two monitors to your system and try again.
`;

type Reason =
	| "wl-mirror-not-found"
	| "monitors-req-not-met"
	| "wlr-randr-not-found";

const handleErrorReason = (reason: Reason) => {
	switch (reason) {
		case "wl-mirror-not-found":
			return WL_MIRROR_NOT_FOUND;
		case "monitors-req-not-met":
			return MONITORS_REQ_NOT_MET;
		case "wlr-randr-not-found":
			return WLR_RANDR_NOT_FOUND;
		default:
			return "Unknown error";
	}
};

export default function HandleMissingRequirements({
	onRefresh,
	reason,
}: {
	onRefresh: () => Promise<void>;
	reason: Reason;
}) {
	return (
		<Detail
			markdown={handleErrorReason(reason)}
			actions={
				<ActionPanel>
					<Action
						title="Retry Connection"
						icon={Icon.RotateClockwise}
						onAction={onRefresh}
					/>
				</ActionPanel>
			}
		/>
	);
}
