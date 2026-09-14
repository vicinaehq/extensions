import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { useEffect, useState } from "react";
import CameraView from "./camera-view";
import MissingRequirements from "./missing-requirements";
import { CameraDevice } from "./types";
import {
	handleError,
	isCameraBackendAvailable,
	listCameraDevices,
} from "./utils";

export default function OpenCamera() {
	const [loading, setLoading] = useState(true);
	const [isBackendAvailable, setIsBackendAvailable] = useState(true);
	const [devices, setDevices] = useState<CameraDevice[]>([]);

	const load = async () => {
		setLoading(true);
		try {
			const backendAvailable = isCameraBackendAvailable();
			setIsBackendAvailable(backendAvailable);
			if (!backendAvailable) return;

			const found = await listCameraDevices();
			setDevices(found);
		} catch (error) {
			await handleError("Failed to detect cameras.", error);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	if (loading) {
		return (
			<List isLoading>
				<List.EmptyView
					icon={Icon.Camera}
					title="Detecting Cameras"
					description="Looking for connected video capture devices..."
				/>
			</List>
		);
	}

	if (!isBackendAvailable) {
		return (
			<MissingRequirements reason="backend-not-available" onRefresh={load} />
		);
	}

	if (devices.length === 0) {
		return <MissingRequirements reason="no-devices-found" onRefresh={load} />;
	}

	if (devices.length === 1) {
		return <CameraView device={devices[0]} />;
	}

	return (
		<List searchBarPlaceholder="Select a camera...">
			{devices.map((device) => (
				<List.Item
					key={device.path}
					title={device.label}
					subtitle={device.path}
					icon={Icon.Camera}
					actions={
						<ActionPanel>
							<Action.Push
								title="Open Camera"
								icon={Icon.ArrowRightCircle}
								target={<CameraView device={device} />}
							/>
						</ActionPanel>
					}
				/>
			))}
		</List>
	);
}
