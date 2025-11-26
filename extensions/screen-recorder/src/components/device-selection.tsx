import React from "react";
import { List, ActionPanel, Action, Icon } from "@vicinae/api";
import type { AudioDevice, CameraDevice } from "../utils/screen-recorder-cli";

interface DeviceSelectionProps {
	devices: AudioDevice[] | CameraDevice[];
	deviceType: "audio" | "camera";
	onSelect: (deviceId: string | null) => void;
	onCancel: () => void;
	selectedDeviceId: string | null;
}

export const DeviceSelection = ({
	devices,
	deviceType,
	onSelect,
	onCancel,
	selectedDeviceId,
}: DeviceSelectionProps) => {
	const title =
		deviceType === "audio" ? "Select Audio Source" : "Select Camera";
	const icon = deviceType === "audio" ? Icon.SpeakerOn : Icon.Camera;

	// For audio devices, separate desktop audio (monitors) from microphones (inputs)
	if (deviceType === "audio") {
		const desktopAudioDevices = devices.filter((device) =>
			device.id.endsWith(".monitor"),
		);
		const microphoneDevices = devices.filter(
			(device) => !device.id.endsWith(".monitor"),
		);

		return (
			<List
				searchBarPlaceholder="Search audio devices..."
				navigationTitle={title}
			>
				<List.Section title="Default">
					<List.Item
						title="None (Default)"
						subtitle="Use system default device"
						icon={Icon.XMarkCircle}
						accessories={
							selectedDeviceId === null ? [{ icon: Icon.Checkmark }] : []
						}
						actions={
							<ActionPanel>
								<Action
									title="Select None"
									icon={Icon.XMarkCircle}
									onAction={() => onSelect(null)}
								/>
								<Action
									title="Go Back"
									icon={Icon.ArrowLeft}
									onAction={onCancel}
									shortcut={{ modifiers: ["cmd"], key: "backspace" }}
								/>
							</ActionPanel>
						}
					/>
				</List.Section>

				{desktopAudioDevices.length > 0 && (
					<List.Section title="Desktop Audio (System Sound)">
						{desktopAudioDevices.map((device) => (
							<List.Item
								key={device.id}
								title={device.name.replace(/^Monitor of /, "")}
								subtitle={`Desktop Audio • ${device.id}`}
								icon={Icon.SpeakerOn}
								accessories={
									selectedDeviceId === device.id
										? [{ icon: Icon.Checkmark }]
										: []
								}
								actions={
									<ActionPanel>
										<Action
											title={`Select ${device.name}`}
											icon={Icon.SpeakerOn}
											onAction={() => onSelect(device.id)}
										/>
										<Action
											title="Go Back"
											icon={Icon.ArrowLeft}
											onAction={onCancel}
											shortcut={{ modifiers: ["cmd"], key: "backspace" }}
										/>
									</ActionPanel>
								}
							/>
						))}
					</List.Section>
				)}

				{microphoneDevices.length > 0 && (
					<List.Section title="Microphones">
						{microphoneDevices.map((device) => (
							<List.Item
								key={device.id}
								title={device.name}
								subtitle={`Microphone • ${device.id}`}
								icon={Icon.Microphone}
								accessories={
									selectedDeviceId === device.id
										? [{ icon: Icon.Checkmark }]
										: []
								}
								actions={
									<ActionPanel>
										<Action
											title={`Select ${device.name}`}
											icon={Icon.Microphone}
											onAction={() => onSelect(device.id)}
										/>
										<Action
											title="Go Back"
											icon={Icon.ArrowLeft}
											onAction={onCancel}
											shortcut={{ modifiers: ["cmd"], key: "backspace" }}
										/>
									</ActionPanel>
								}
							/>
						))}
					</List.Section>
				)}
			</List>
		);
	}

	// Camera selection (unchanged)
	return (
		<List
			searchBarPlaceholder={`Search ${deviceType} devices...`}
			navigationTitle={title}
		>
			<List.Section title="Available Cameras">
				<List.Item
					title="None (Default)"
					subtitle="Use system default device"
					icon={Icon.XMarkCircle}
					accessories={
						selectedDeviceId === null ? [{ icon: Icon.Checkmark }] : []
					}
					actions={
						<ActionPanel>
							<Action
								title="Select None"
								icon={Icon.XMarkCircle}
								onAction={() => onSelect(null)}
							/>
							<Action
								title="Go Back"
								icon={Icon.ArrowLeft}
								onAction={onCancel}
								shortcut={{ modifiers: ["cmd"], key: "backspace" }}
							/>
						</ActionPanel>
					}
				/>
				{devices.map((device) => (
					<List.Item
						key={device.id}
						title={device.name}
						subtitle={device.id}
						icon={icon}
						accessories={
							selectedDeviceId === device.id ? [{ icon: Icon.Checkmark }] : []
						}
						actions={
							<ActionPanel>
								<Action
									title={`Select ${device.name}`}
									icon={icon}
									onAction={() => onSelect(device.id)}
								/>
								<Action
									title="Go Back"
									icon={Icon.ArrowLeft}
									onAction={onCancel}
									shortcut={{ modifiers: ["cmd"], key: "backspace" }}
								/>
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
		</List>
	);
};
