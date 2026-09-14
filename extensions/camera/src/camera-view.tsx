import {
	Action,
	ActionPanel,
	Clipboard,
	Color,
	Detail,
	getPreferenceValues,
	Icon,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { CameraDevice, Preferences } from "./types";
import {
	capturePhoto,
	getActivePreviewSession,
	handleError,
	showSuccess,
	startCameraPreview,
	stopCameraPreview,
} from "./utils";

type Props = {
	device: CameraDevice;
};

export default function CameraView({ device }: Props) {
	const [isPreviewActive, setIsPreviewActive] = useState(false);
	const [isBusy, setIsBusy] = useState(false);
	const [lastPhotoPath, setLastPhotoPath] = useState<string | null>(null);

	const refreshPreviewState = async () => {
		const session = await getActivePreviewSession();
		setIsPreviewActive(session?.path === device.path);
	};

	useEffect(() => {
		refreshPreviewState();
		const interval = setInterval(refreshPreviewState, 1500);
		return () => clearInterval(interval);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [device.path]);

	const handleTogglePreview = async () => {
		setIsBusy(true);
		try {
			const preferences = getPreferenceValues<Preferences>();
			if (isPreviewActive) {
				await stopCameraPreview();
			} else {
				await startCameraPreview(device, preferences.resolution);
			}
		} finally {
			await refreshPreviewState();
			setIsBusy(false);
		}
	};

	const handleTakePhoto = async () => {
		setIsBusy(true);
		try {
			const preferences = getPreferenceValues<Preferences>();
			const outputPath = await capturePhoto(device, preferences);
			setLastPhotoPath(outputPath);
			showSuccess("Photo captured", outputPath);
		} catch (error) {
			handleError("Failed to capture photo.", error);
		} finally {
			setIsBusy(false);
		}
	};

	const handleCopyLastPhoto = async () => {
		if (!lastPhotoPath) return;
		try {
			await Clipboard.copy({ file: lastPhotoPath });
			showSuccess("Photo copied to clipboard");
		} catch (error) {
			handleError("Failed to copy photo.", error);
		}
	};

	return (
		<Detail
			navigationTitle={device.label}
			markdown={`# ${device.label}\n\n${isBusy ? "Working…" : "Start a live preview window or capture a still photo using the actions below."}`}
			metadata={
				<Detail.Metadata>
					<Detail.Metadata.TagList title="Status">
						<Detail.Metadata.TagList.Item
							text={isPreviewActive ? "Preview Active" : "Idle"}
							color={isPreviewActive ? Color.Green : Color.SecondaryText}
							icon={isPreviewActive ? Icon.Video : Icon.VideoDisabled}
						/>
					</Detail.Metadata.TagList>

					<Detail.Metadata.Separator />

					<Detail.Metadata.Label
						title="Device"
						text={device.label}
						icon={Icon.Camera}
					/>
					<Detail.Metadata.Label title="Device Path" text={device.path} />

					{lastPhotoPath && (
						<>
							<Detail.Metadata.Separator />
							<Detail.Metadata.Label
								title="Last Photo"
								text={lastPhotoPath}
								icon={Icon.Image}
							/>
						</>
					)}
				</Detail.Metadata>
			}
			actions={
				<ActionPanel>
					<Action
						title={
							isPreviewActive ? "Stop Camera Preview" : "Start Camera Preview"
						}
						icon={isPreviewActive ? Icon.Stop : Icon.Play}
						style={
							isPreviewActive ? Action.Style.Destructive : Action.Style.Regular
						}
						onAction={handleTogglePreview}
					/>
					<Action
						title="Take Photo"
						icon={Icon.Camera}
						onAction={handleTakePhoto}
					/>
					{lastPhotoPath && (
						<>
							<Action.ShowInFinder
								title="Show Last Photo in File Browser"
								path={lastPhotoPath}
								icon={Icon.Folder}
							/>
							<Action
								title="Copy Last Photo"
								icon={Icon.CopyClipboard}
								onAction={handleCopyLastPhoto}
							/>
						</>
					)}
				</ActionPanel>
			}
		/>
	);
}
