import { useEffect, useState, useCallback, useRef } from "react";
import {
	Action,
	ActionPanel,
	List,
	Alert,
	Toast,
	showToast,
	Icon,
	Color,
	confirmAlert
} from "@vicinae/api";
import {
	Bluetoothctl,
	BluetoothctlLine,
	BluetoothctlLineType,
	Device,
	PairingEvent,
	PairingEventType,
	makeDiscoverable,
	makeUndiscoverable
} from "@/bluetoothctl";

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

	const btRef = useRef<Bluetoothctl | null>(null);
	const cleanupFunctionRef = useRef<(() => void) | null>(null);

	const checkDiscoverabilityStatus = useCallback(async () => {
		setStatus(prev => ({ ...prev, loading: true }));

		try {
			// Get controller info to check discoverability status
			const info = await Bluetoothctl.getControllerInfo();
			const discoverable = info.includes("Discoverable: yes");

			setStatus(prev => ({
				...prev,
				discoverable,
				loading: false,
				// Remember original state only on first check
				wasOriginallyDiscoverable: prev.wasOriginallyDiscoverable !== null ? prev.wasOriginallyDiscoverable : discoverable,
			}));
		} catch (error) {
			console.error("Failed to get discoverability status:", error);
			showToast({
				style: Toast.Style.Failure,
				title: "Failed to get Bluetooth status"
			});
			setStatus(prev => ({ ...prev, loading: false }));
		}
	}, []);

	const DiscoverableCallback = useCallback(async () => {
		try {
			setStatus(prev => ({ ...prev, loading: true }));

			// Clean up any existing discoverable session
			if (cleanupFunctionRef.current) {
				cleanupFunctionRef.current();
				cleanupFunctionRef.current = null;
			}

			const cleanup = await makeDiscoverable();
			cleanupFunctionRef.current = cleanup;

			setStatus(prev => ({ ...prev, discoverable: true, loading: false }));

		} catch (error) {
			console.error("Failed to make discoverable:", error);
			showToast({
				style: Toast.Style.Failure,
				title: "Failed to make device discoverable",
				message: error instanceof Error ? error.message : "Unknown error"
			});
			setStatus(prev => ({ ...prev, loading: false }));
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

			setStatus(prev => ({
				...prev,
				discoverable: status.wasOriginallyDiscoverable,
				pairingDevice: null
			}));

		} catch (error) {
			console.error("Failed to restore original state:", error);
			showToast({
				style: Toast.Style.Failure,
				title: "Failed to restore discoverability state",
				message: error instanceof Error ? error.message : "Unknown error"
			});
		}
	}, [status.wasOriginallyDiscoverable, status.discoverable]);

	// Monitor for incoming pairing requests using a separate Bluetoothctl instance
	const setupPairingMonitor = useCallback(() => {
		if (btRef.current) {
			btRef.current.kill();
		}

		const bt = new Bluetoothctl();
		btRef.current = bt;

		const handlePairingLine = async (line: BluetoothctlLine) => {
			switch (line.type) {
				case BluetoothctlLineType.DeviceNew: {
					// A new device is attempting to pair
					const device: Device = {
						mac: line.device.mac,
						name: line.device.name,
						icon: "",
						connected: false,
						trusted: false,
					};

					setStatus(prev => ({ ...prev, pairingDevice: device }));

					await showToast({
						style: Toast.Style.Success,
						title: "New Device Found",
						message: `${line.device.name} is attempting to connect`,
					});
					break;
				}

				case BluetoothctlLineType.PasskeyConfirmation: {
					if (status.pairingDevice) {
						await handleIncomingPairingEvent({
							type: PairingEventType.PasskeyConfirmation,
							device: status.pairingDevice,
							passkey: line.passkey
						}, bt);
					}
					break;
				}

				case BluetoothctlLineType.PinCodeRequest: {
					if (status.pairingDevice) {
						await handleIncomingPairingEvent({
							type: PairingEventType.PinCodeRequest,
							device: status.pairingDevice
						}, bt);
					}
					break;
				}

				case BluetoothctlLineType.PairingSuccess: {
					if (status.pairingDevice) {
						await handleIncomingPairingEvent({
							type: PairingEventType.PairingSuccess,
							device: status.pairingDevice
						}, bt);
						setStatus(prev => ({ ...prev, pairingDevice: null }));
					}
					break;
				}

				case BluetoothctlLineType.PairingFailure: {
					if (status.pairingDevice) {
						await handleIncomingPairingEvent({
							type: PairingEventType.PairingFailure,
							device: status.pairingDevice,
							reason: line.reason
						}, bt);
						setStatus(prev => ({ ...prev, pairingDevice: null }));
					}
					break;
				}
			}
		};

		bt.onLine(handlePairingLine);
	}, [status.pairingDevice]);

	// On mount: check status and make discoverable
	useEffect(() => {
		const initializeDiscoverability = async () => {
			await checkDiscoverabilityStatus();
			// Small delay to ensure state is set
			setTimeout(async () => {
				await DiscoverableCallback();
				// Set up pairing monitor after becoming discoverable
				setupPairingMonitor();
			}, 100);
		};

		initializeDiscoverability();

		// Cleanup function to restore original state
		return () => {
			if (btRef.current) {
				btRef.current.kill();
				btRef.current = null;
			}
			restoreOriginalState();
		};
	}, []);

	return {
		status,
		makeDiscoverable: DiscoverableCallback,
		restoreOriginalState,
	};
}

// Helper function for handling incoming pairing events
async function handleIncomingPairingEvent(event: PairingEvent, bt: Bluetoothctl) {
	switch (event.type) {
		case PairingEventType.PasskeyConfirmation: {
			const confirm = await confirmAlert({
				title: `Incoming Pairing Request`,
				message: `${event.device.name} wants to pair with this device.\n\nDoes the passkey match on your device?\n\nPasskey: ${event.passkey}`,
				primaryAction: { title: "Accept", style: Alert.ActionStyle.Default },
				dismissAction: { title: "Decline" },
			});

			if (confirm) {
				bt.yes();
				await showToast({
					style: Toast.Style.Animated,
					title: "Pairing Accepted",
					message: `Accepting pairing request from ${event.device.name}...`,
				});
			} else {
				bt.no();
				await showToast({
					style: Toast.Style.Failure,
					title: "Pairing Declined",
					message: `Declined pairing request from ${event.device.name}`,
				});
			}
			break;
		}

		case PairingEventType.PinCodeRequest: {
			const pin = prompt(`Enter PIN Code for incoming pairing request from ${event.device.name}`);
			if (pin) {
				bt.pin(pin);
				await showToast({
					style: Toast.Style.Animated,
					title: "PIN Entered",
					message: `Processing pairing request from ${event.device.name}...`,
				});
			} else {
				await showToast({
					style: Toast.Style.Failure,
					title: "Pairing Cancelled",
					message: `PIN entry cancelled for ${event.device.name}`,
				});
			}
			break;
		}

		case PairingEventType.PairingSuccess: {
			await showToast({
				style: Toast.Style.Success,
				title: "Device Paired Successfully",
				message: `Successfully paired with ${event.device.name}`,
			});
			break;
		}

		case PairingEventType.PairingFailure: {
			await showToast({
				style: Toast.Style.Failure,
				title: "Pairing Failed",
				message: `Failed to pair with ${event.device.name}: ${event.reason ?? "Unknown error"}`,
			});
			break;
		}
	}
}

// Main component
export default function Discoverable() {
	const { status } = useDiscoverability();

	const getDescription = () => {
		if (status.loading) {
			return "Setting up discoverability...";
		}

		let description = "Your device is visible to other Bluetooth devices while this command is open.\n\n";

		if (status.pairingDevice) {
			description += `Currently pairing with: ${status.pairingDevice.name}\n\n`;
		}

		description += "Discoverability will be automatically restored to its original state when you exit this view.";

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
								shortcut={{ modifiers: ["ctrl"], key: "s" }}
							/>
							<Action.Open
								title="Manage Devices"
								icon={Icon.List}
								target="vicinae://extensions/Gelei/bluetooth/devices"
								shortcut={{ modifiers: ["ctrl"], key: "m" }}
							/>
						</ActionPanel.Section>
					</ActionPanel>
				}
			/>
		</List>
	);
}
