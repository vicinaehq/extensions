import { promises as fs } from "fs";
import os from "os";
import path from "path";
import {
	Action,
	ActionPanel,
	Clipboard,
	Color,
	Detail,
	getPreferenceValues,
	Icon,
} from "@vicinae/api";
import { useEffect, useRef, useState } from "react";
import { CameraDevice, Preferences } from "./types";
import {
	applyPostCaptureActions,
	captureFrameBuffer,
	capturePhoto,
	describePostCaptureOutcome,
	handleError,
	showSuccess,
} from "./utils";

const PREVIEW_INTERVAL_MS = 1200;

type Props = {
	device: CameraDevice;
};

export default function CameraView({ device }: Props) {
	const [isPreviewActive, setIsPreviewActive] = useState(false);
	const [previewFramePath, setPreviewFramePath] = useState<string | null>(null);
	const [isBusy, setIsBusy] = useState(false);
	const [lastPhotoPath, setLastPhotoPath] = useState<string | null>(null);

	const isMounted = useRef(true);
	const isCapturingFrame = useRef(false);
	const frameCounter = useRef(0);
	const currentFramePath = useRef<string | null>(null);
	// Unique per mounted instance so two CameraView instances (e.g. kept alive
	// in a navigation stack for different devices) can never collide on the
	// same temp file name.
	const instanceId = useRef(
		`${device.path.replace(/[^a-zA-Z0-9]/g, "_")}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
	);

	const cleanupFrame = async (framePath: string | null) => {
		if (!framePath) return;
		try {
			await fs.unlink(framePath);
		} catch {
			// already removed or never written
		}
	};

	useEffect(() => {
		isMounted.current = true;
		return () => {
			isMounted.current = false;
		};
	}, []);

	useEffect(() => {
		if (!isPreviewActive) return;

		const tick = async () => {
			if (isCapturingFrame.current) return;
			isCapturingFrame.current = true;
			try {
				const preferences = getPreferenceValues<Preferences>();
				const buffer = await captureFrameBuffer(device, preferences.resolution);
				frameCounter.current += 1;
				const framePath = path.join(
					os.tmpdir(),
					`vicinae-camera-preview-${instanceId.current}-${frameCounter.current}.jpg`,
				);
				await fs.writeFile(framePath, buffer);

				const previousFramePath = currentFramePath.current;
				currentFramePath.current = framePath;
				if (isMounted.current) setPreviewFramePath(framePath);
				await cleanupFrame(previousFramePath);
			} catch (error) {
				if (isMounted.current) setIsPreviewActive(false);
				await handleError("Live preview stopped.", error);
			} finally {
				isCapturingFrame.current = false;
			}
		};

		tick();
		const interval = setInterval(tick, PREVIEW_INTERVAL_MS);
		return () => {
			clearInterval(interval);
			const framePath = currentFramePath.current;
			currentFramePath.current = null;
			if (isMounted.current) setPreviewFramePath(null);
			cleanupFrame(framePath);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isPreviewActive, device.path]);

	const handleTogglePreview = () => {
		setIsPreviewActive((active) => !active);
	};

	const handleTakePhoto = async () => {
		setIsBusy(true);
		try {
			const preferences = getPreferenceValues<Preferences>();
			const outputPath = await capturePhoto(device, preferences);
			setLastPhotoPath(outputPath);

			const outcome = await applyPostCaptureActions(outputPath, preferences);
			const warning = describePostCaptureOutcome(outcome);
			await showSuccess("Photo captured", warning ?? outputPath);
		} catch (error) {
			await handleError("Failed to capture photo.", error);
		} finally {
			setIsBusy(false);
		}
	};

	const handleCopyLastPhoto = async () => {
		if (!lastPhotoPath) return;
		try {
			await Clipboard.copy({ file: lastPhotoPath });
			await showSuccess("Photo copied to clipboard");
		} catch (error) {
			await handleError("Failed to copy photo.", error);
		}
	};

	const statusMarkdown = isPreviewActive
		? previewFramePath
			? `![Live preview](${previewFramePath})`
			: "Starting live preview…"
		: `# ${device.label}\n\n${isBusy ? "Working…" : "Start a live preview or capture a still photo using the actions below."}`;

	return (
		<Detail
			navigationTitle={device.label}
			markdown={statusMarkdown}
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

					{isPreviewActive && (
						<Detail.Metadata.Label
							title="Refresh Rate"
							text={`~${(PREVIEW_INTERVAL_MS / 1000).toFixed(1)}s per frame`}
						/>
					)}

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
						title={isPreviewActive ? "Stop Live Preview" : "Start Live Preview"}
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
