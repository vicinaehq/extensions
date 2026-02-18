import { useState, useEffect, useCallback } from "react";
import { LocalStorage } from "@vicinae/api";
import type { AudioDevice, CameraDevice } from "../utils/screen-recorder-cli";

interface UsePersistedDeviceSelectionResult {
	selectedDeviceId: string | null;
	setSelectedDeviceId: (deviceId: string | null) => Promise<void>;
}

export const usePersistedDeviceSelection = (
	storageKey: string,
	availableDevices: AudioDevice[] | CameraDevice[],
): UsePersistedDeviceSelectionResult => {
	const [selectedDeviceId, setSelectedDeviceIdState] = useState<string | null>(
		null,
	);

	// Load saved device on mount
	useEffect(() => {
		const loadSavedDevice = async () => {
			try {
				const savedDeviceId =
					await LocalStorage.getItem<string>(storageKey);
				if (savedDeviceId) {
					const deviceExists = availableDevices.some(
						(d) => d.id === savedDeviceId,
					);
					if (deviceExists) {
						setSelectedDeviceIdState(savedDeviceId);
					} else {
						// Device no longer exists, remove from storage
						await LocalStorage.removeItem(storageKey);
					}
				}
			} catch (error) {
				console.warn(`Failed to load device preference for ${storageKey}:`, error);
			}
		};

		if (availableDevices.length > 0) {
			loadSavedDevice();
		}
	}, [storageKey, availableDevices]);

	const setSelectedDeviceId = useCallback(
		async (deviceId: string | null) => {
			setSelectedDeviceIdState(deviceId);
			try {
				if (deviceId) {
					await LocalStorage.setItem(storageKey, deviceId);
				} else {
					await LocalStorage.removeItem(storageKey);
				}
			} catch (error) {
				console.warn(`Failed to save device preference for ${storageKey}:`, error);
			}
		},
		[storageKey],
	);

	return {
		selectedDeviceId,
		setSelectedDeviceId,
	};
};

