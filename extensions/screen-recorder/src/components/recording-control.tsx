import React, { useState, useEffect } from "react";
import {
	List,
	ActionPanel,
	Action,
	Icon,
	Toast,
	showToast,
} from "@vicinae/api";
import {
	isRecording,
	startRecording,
	stopRecording,
	getAvailableAudioSources,
	getAvailableCameras,
	type AudioDevice,
	type CameraDevice,
} from "../utils/screen-recorder-cli";
import { DeviceSelection } from "./device-selection";
import { usePersistedDeviceSelection } from "../hooks/use-persisted-device-selection";

export const RecordingControl = () => {
	const [isLoading, setIsLoading] = useState(true);
	const [isCurrentlyRecording, setIsCurrentlyRecording] = useState(false);
	const [audioSources, setAudioSources] = useState<AudioDevice[]>([]);
	const [cameras, setCameras] = useState<CameraDevice[]>([]);
	const [showAudioSelection, setShowAudioSelection] = useState(false);
	const [showCameraSelection, setShowCameraSelection] = useState(false);

	const {
		selectedDeviceId: selectedAudioDeviceId,
		setSelectedDeviceId: setSelectedAudioDeviceId,
	} = usePersistedDeviceSelection("selected-audio-device", audioSources);

	const {
		selectedDeviceId: selectedCameraDeviceId,
		setSelectedDeviceId: setSelectedCameraDeviceId,
	} = usePersistedDeviceSelection("selected-camera-device", cameras);

	useEffect(() => {
		const loadState = async () => {
			try {
				const [recording, audio, cams] = await Promise.all([
					isRecording(),
					getAvailableAudioSources(),
					getAvailableCameras(),
				]);

				setIsCurrentlyRecording(recording);
				setAudioSources(audio);
				setCameras(cams);
			} catch (error) {
				console.error("Failed to load recording state:", error);
			} finally {
				setIsLoading(false);
			}
		};

		loadState();

		// Refresh recording status every 2 seconds
		const interval = setInterval(() => {
			isRecording().then(setIsCurrentlyRecording);
		}, 2000);

		return () => clearInterval(interval);
	}, []);

	const handleStartRecording = async (options: {
		audio?: boolean;
		webcam?: boolean;
	}) => {
		try {
			const outputFile = await startRecording({
				audio: options.audio,
				webcam: options.webcam,
				audioDevice: options.audio
					? selectedAudioDeviceId || undefined
					: undefined,
				cameraDevice: options.webcam
					? selectedCameraDeviceId || undefined
					: undefined,
			});

			setIsCurrentlyRecording(true);

			showToast({
				title: "Recording Started",
				message: `Saving to: ${outputFile}`,
				style: Toast.Style.Success,
			});
		} catch (error) {
			showToast({
				title: "Failed to Start Recording",
				message: error instanceof Error ? error.message : "Unknown error",
				style: Toast.Style.Failure,
			});
		}
	};

	const handleStopRecording = async () => {
		try {
			await stopRecording();
			setIsCurrentlyRecording(false);

			showToast({
				title: "Recording Stopped",
				style: Toast.Style.Success,
			});
		} catch (error) {
			showToast({
				title: "Failed to Stop Recording",
				message: error instanceof Error ? error.message : "Unknown error",
				style: Toast.Style.Failure,
			});
		}
	};

	if (isLoading) {
		return <List isLoading={true} />;
	}

	// Show device selection views
	if (showAudioSelection) {
		return (
			<DeviceSelection
				devices={audioSources}
				deviceType="audio"
				onSelect={async (deviceId) => {
					await setSelectedAudioDeviceId(deviceId);
					setShowAudioSelection(false);
				}}
				onCancel={() => setShowAudioSelection(false)}
				selectedDeviceId={selectedAudioDeviceId}
			/>
		);
	}

	if (showCameraSelection) {
		return (
			<DeviceSelection
				devices={cameras}
				deviceType="camera"
				onSelect={async (deviceId) => {
					await setSelectedCameraDeviceId(deviceId);
					setShowCameraSelection(false);
				}}
				onCancel={() => setShowCameraSelection(false)}
				selectedDeviceId={selectedCameraDeviceId}
			/>
		);
	}

	// Helper to get selected device name
	const getSelectedAudioDeviceName = () => {
		if (!selectedAudioDeviceId) return null;
		return (
			audioSources.find((d) => d.id === selectedAudioDeviceId)?.name || null
		);
	};

	const getSelectedCameraDeviceName = () => {
		if (!selectedCameraDeviceId) return null;
		return cameras.find((d) => d.id === selectedCameraDeviceId)?.name || null;
	};

	if (isCurrentlyRecording) {
		return (
			<List>
				<List.Section title="Recording in Progress">
					<List.Item
						title="Stop Recording"
						subtitle="Click to stop the current screen recording"
						icon={Icon.Stop}
						actions={
							<ActionPanel>
								<Action
									title="Stop Recording"
									icon={Icon.Stop}
									onAction={handleStopRecording}
									style={Action.Style.Destructive}
								/>
							</ActionPanel>
						}
					/>
				</List.Section>
			</List>
		);
	}

	return (
		<List searchBarPlaceholder="Select recording option...">
			<List.Section title="Start Recording">
				<List.Item
					title="Start Screen Recording"
					subtitle="Record your screen without audio"
					icon={Icon.Play}
					actions={
						<ActionPanel>
							<Action
								title="Start Recording"
								icon={Icon.Play}
								onAction={() => handleStartRecording({})}
							/>
						</ActionPanel>
					}
				/>

				{audioSources.length > 0 && (
					<List.Item
						title="Start Recording with Audio"
						subtitle="Record your screen with system audio"
						icon={Icon.Play}
						actions={
							<ActionPanel>
								<Action
									title="Start Recording with Audio"
									icon={Icon.Play}
									onAction={() => handleStartRecording({ audio: true })}
								/>
							</ActionPanel>
						}
					/>
				)}

				{cameras.length > 0 && (
					<List.Item
						title="Start Recording with Webcam"
						subtitle="Record your screen with webcam overlay"
						icon={Icon.Play}
						actions={
							<ActionPanel>
								<Action
									title="Start Recording with Webcam"
									icon={Icon.Play}
									onAction={() => handleStartRecording({ webcam: true })}
								/>
							</ActionPanel>
						}
					/>
				)}

				{audioSources.length > 0 && cameras.length > 0 && (
					<List.Item
						title="Start Recording with Audio & Webcam"
						subtitle="Record your screen with audio and webcam"
						icon={Icon.Play}
						actions={
							<ActionPanel>
								<Action
									title="Start Recording with Audio & Webcam"
									icon={Icon.Play}
									onAction={() =>
										handleStartRecording({ audio: true, webcam: true })
									}
								/>
							</ActionPanel>
						}
					/>
				)}
			</List.Section>

			<List.Section title="Device Information">
				{audioSources.length > 0 && (
					<List.Item
						title="Audio Sources"
						subtitle={
							getSelectedAudioDeviceName()
								? `Selected: ${getSelectedAudioDeviceName()} (${
										audioSources.length
									} available)`
								: `${audioSources.length} audio source(s) available - Click to select`
						}
						icon={Icon.SpeakerOn}
						actions={
							<ActionPanel>
								<Action
									title="Select Audio Device"
									icon={Icon.SpeakerOn}
									onAction={() => setShowAudioSelection(true)}
								/>
								{selectedAudioDeviceId && (
									<Action
										title="Clear Selection"
										icon={Icon.XMarkCircle}
										onAction={() => void setSelectedAudioDeviceId(null)}
										shortcut={{ modifiers: ["cmd"], key: "backspace" }}
									/>
								)}
							</ActionPanel>
						}
					/>
				)}

				{cameras.length > 0 && (
					<List.Item
						title="Cameras"
						subtitle={
							getSelectedCameraDeviceName()
								? `Selected: ${getSelectedCameraDeviceName()} (${
										cameras.length
									} available)`
								: `${cameras.length} camera(s) available - Click to select`
						}
						icon={Icon.Camera}
						actions={
							<ActionPanel>
								<Action
									title="Select Camera"
									icon={Icon.Camera}
									onAction={() => setShowCameraSelection(true)}
								/>
								{selectedCameraDeviceId && (
									<Action
										title="Clear Selection"
										icon={Icon.XMarkCircle}
										onAction={() => void setSelectedCameraDeviceId(null)}
										shortcut={{ modifiers: ["cmd"], key: "backspace" }}
									/>
								)}
							</ActionPanel>
						}
					/>
				)}

				{audioSources.length === 0 && cameras.length === 0 && (
					<List.Item
						title="No Devices Found"
						subtitle="No audio sources or cameras detected"
						icon={Icon.ExclamationMark}
					/>
				)}
			</List.Section>
		</List>
	);
};
