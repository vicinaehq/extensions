import {
	Action,
	ActionPanel,
	Color,
	Icon,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Device, makeDiscoverable, makeUndiscoverable } from "@/bluetooth";
import { getAdapterInfo } from "@/bluez";

interface DiscoverabilityStatus {
	discoverable: boolean;
	loading: boolean;
	wasOriginallyDiscoverable: boolean;
	pairingDevice: Device | null;
}

// Custom hook for managing discoverability with enhanced pairing support
function useDiscoverability() {
	const [status, setStatus] = useState<DiscoverabilityStatus>({
		discoverable: false,
		loading: true,
		wasOriginallyDiscoverable: false,
		pairingDevice: null,
	});

	const cleanupFunctionRef = useRef<(() => void) | null>(null);

	const checkDiscoverabilityStatus = useCallback(async () => {
		setStatus((prev) => ({ ...prev, loading: true }));

		try {
			const props = await getAdapterInfo();
			const discoverable = props.Discoverable === true;

			setStatus((prev) => ({
				...prev,
				discoverable,
				loading: false,
				// Remember original state only on first check
				wasOriginallyDiscoverable:
					prev.wasOriginallyDiscoverable !== null
						? prev.wasOriginallyDiscoverable
						: discoverable,
			}));
		} catch (error) {
			console.error("Failed to get discoverability status:", error);
			showToast({
				style: Toast.Style.Failure,
				title: "Failed to get Bluetooth status",
			});
			setStatus((prev) => ({ ...prev, loading: false }));
		}
	}, []);

	const DiscoverableCallback = useCallback(async () => {
		try {
			setStatus((prev) => ({ ...prev, loading: true }));

			// Clean up any existing discoverable session
			if (cleanupFunctionRef.current) {
				cleanupFunctionRef.current();
				cleanupFunctionRef.current = null;
			}

			const cleanup = await makeDiscoverable({
				onPairingDevice: (d) =>
					setStatus((prev) => ({ ...prev, pairingDevice: d })),
			});
			cleanupFunctionRef.current = cleanup;

			setStatus((prev) => ({ ...prev, discoverable: true, loading: false }));
		} catch (error) {
			console.error("Failed to make discoverable:", error);
			showToast({
				style: Toast.Style.Failure,
				title: "Failed to make device discoverable",
				message: error instanceof Error ? error.message : "Unknown error",
			});
			setStatus((prev) => ({ ...prev, loading: false }));
		}
	}, []);

	const restoreOriginalState = useCallback(async () => {
		try {
			// Use the cleanup function if available
			if (cleanupFunctionRef.current) {
				cleanupFunctionRef.current();
				cleanupFunctionRef.current = null;
			} else if (!status.wasOriginallyDiscoverable && status.discoverable) {
				// Fallback to direct undiscoverable call
				await makeUndiscoverable();
			}

			setStatus((prev) => ({
				...prev,
				discoverable: status.wasOriginallyDiscoverable,
				pairingDevice: null,
			}));
		} catch (error) {
			console.error("Failed to restore original state:", error);
			showToast({
				style: Toast.Style.Failure,
				title: "Failed to restore discoverability state",
				message: error instanceof Error ? error.message : "Unknown error",
			});
		}
	}, [status.wasOriginallyDiscoverable, status.discoverable]);

	// makeDiscoverable now handles pairing and onPairingDevice callback - no separate monitor needed

	// On mount: check status and make discoverable
	useEffect(() => {
		const initializeDiscoverability = async () => {
			await checkDiscoverabilityStatus();
			setTimeout(async () => {
				await DiscoverableCallback();
			}, 100);
		};

		initializeDiscoverability();

		// Cleanup function to restore original state
		return () => {
			restoreOriginalState();
		};
	}, []);

	return {
		status,
		makeDiscoverable: DiscoverableCallback,
		restoreOriginalState,
	};
}

// Main component
export default function Discoverable() {
	const { status } = useDiscoverability();

	const getDescription = () => {
		if (status.loading) {
			return "Setting up discoverability...";
		}

		let description =
			"Your device is visible to other Bluetooth devices while this command is open.\n\n";

		if (status.pairingDevice) {
			description += `Currently pairing with: ${status.pairingDevice.name}\n\n`;
		}

		description +=
			"Discoverability will be automatically restored to its original state when you exit this view.";

		return description;
	};

	const getTitle = () => {
		if (status.loading) {
			return "Setting up Discoverability";
		}

		if (status.pairingDevice) {
			return `Pairing with ${status.pairingDevice.name}`;
		}

		return "Device is Discoverable";
	};

	return (
		<List isLoading={status.loading}>
			<List.EmptyView
				icon={{
					source: status.pairingDevice ? Icon.Link : Icon.Eye,
					tintColor: status.pairingDevice ? Color.Blue : Color.Green,
				}}
				title={getTitle()}
				description={getDescription()}
				actions={
					<ActionPanel>
						<ActionPanel.Section title="Navigation">
							<Action.Open
								title="Scan for Devices"
								icon={Icon.Bluetooth}
								target="vicinae://extensions/Gelei/bluetooth/scan"
								shortcut={{ modifiers: ["cmd"], key: "s" }}
							/>
							<Action.Open
								title="Manage Devices"
								icon={Icon.List}
								target="vicinae://extensions/Gelei/bluetooth/devices"
								shortcut={{ modifiers: ["cmd"], key: "m" }}
							/>
						</ActionPanel.Section>
					</ActionPanel>
				}
			/>
		</List>
	);
}
