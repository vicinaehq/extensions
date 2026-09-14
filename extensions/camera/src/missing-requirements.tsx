import { Action, ActionPanel, Detail, Icon } from "@vicinae/api";

const FFMPEG_NOT_FOUND = `## ffmpeg not installed
ffmpeg is required for this extension to capture photos and preview your camera.

### Installation Instructions
##### Arch Linux
  sudo pacman -S ffmpeg
##### Ubuntu/Debian
  sudo apt install ffmpeg
##### Fedora
  sudo dnf install ffmpeg
##### macOS
  brew install ffmpeg
`;

const NO_DEVICES_FOUND = `## No camera found
No video capture device was detected on this system.

Make sure your webcam is connected and not exclusively in use by another application, then try again.
`;

type Reason = "ffmpeg-not-found" | "no-devices-found";

const messageForReason = (reason: Reason) => {
	switch (reason) {
		case "ffmpeg-not-found":
			return FFMPEG_NOT_FOUND;
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
