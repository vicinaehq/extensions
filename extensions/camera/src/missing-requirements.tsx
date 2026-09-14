import { Action, ActionPanel, Detail, Icon } from "@vicinae/api";

const BACKEND_NOT_AVAILABLE = `## Camera support unavailable
This extension captures photos through the \`v4l2camera\` native module, which is installed automatically alongside the extension — no separate program to install.

It only works on Linux, and needs to be compiled against your kernel's video4linux2 headers the first time the extension is installed. If you are on Linux and still see this message, the native build most likely failed. Make sure a C/C++ toolchain is available, then reinstall the extension.

### Installation Instructions
##### Arch Linux
  sudo pacman -S base-devel v4l-utils
##### Ubuntu/Debian
  sudo apt install build-essential libv4l-dev
##### Fedora
  sudo dnf groupinstall "Development Tools" && sudo dnf install libv4l-devel
`;

const NO_DEVICES_FOUND = `## No camera found
No video capture device was detected on this system.

Make sure your webcam is connected and not exclusively in use by another application, then try again.
`;

type Reason = "backend-not-available" | "no-devices-found";

const messageForReason = (reason: Reason) => {
	switch (reason) {
		case "backend-not-available":
			return BACKEND_NOT_AVAILABLE;
		case "no-devices-found":
			return NO_DEVICES_FOUND;
	}
};

export default function MissingRequirements({
	reason,
	onRefresh,
}: {
	reason: Reason;
	onRefresh: () => Promise<void>;
}) {
	return (
		<Detail
			markdown={messageForReason(reason)}
			actions={
				<ActionPanel>
					<Action
						title="Retry"
						icon={Icon.RotateClockwise}
						onAction={onRefresh}
					/>
				</ActionPanel>
			}
		/>
	);
}
