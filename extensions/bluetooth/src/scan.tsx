import { useEffect, useState, useCallback, useRef } from "react";
import {
	Action,
	ActionPanel,
	Icon,
	List,
} from "@vicinae/api";
import {
	pairToDevice,
	connectToDevice,
	Device,
	Bluetoothctl,
	BluetoothState,
	BluetoothctlLine,
	LineType
} from "@/bluetoothctl";
import {
	getIconFromInfo,
	sortDevices,
	removeFromDeviceList
} from "@/utils";
import {
	BluetoothPoweredOffView,
	TogglePowerAction,
	showErrorToast
} from "./defaultComponents";
import { BLUETOOTH_REGEX } from "@/patterns";

// Simplified processing function using the new parsing system
async function processBluetoothLine(
	line: BluetoothctlLine,
	discovered: Map<string, string>,
	setDevices: React.Dispatch<React.SetStateAction<Device[]>>
): Promise<void> {
	switch (line.type) {
		case LineType.DeviceDeleted:
			await handleDeletedDevice(line, discovered, setDevices);
			break;

		case LineType.DeviceChanged:
			await handleChangedDevice(line, discovered, setDevices);
			break;

		case LineType.DeviceNew:
			await handleNewDevice(line, discovered, setDevices);
			break;

		default:
			break;
	}
}

async function handleDeletedDevice(
	line: Extract<BluetoothctlLine, { type: LineType.DeviceDeleted }>,
	discovered: Map<string, string>,
	setDevices: React.Dispatch<React.SetStateAction<Device[]>>
): Promise<void> {
	const mac = line.device.mac;
	discovered.delete(mac);
	removeFromDeviceList(mac, setDevices);
}

async function handleChangedDevice(
	line: Extract<BluetoothctlLine, { type: LineType.DeviceChanged }>,
	discovered: Map<string, string>,
	setDevices: React.Dispatch<React.SetStateAction<Device[]>>
): Promise<void> {
	const mac = line.device.mac;
	const device = await Bluetoothctl.getDeviceInfo(mac);

	if (!device) return;

	discovered.set(mac, device.name);

	setDevices((prev) =>
		sortDevices(
			prev.map((device) =>
				device.mac === mac
					? { ...device, name, icon, connected: isConnected, trusted: false }
					: device
			)
		)
	);

	// Remove connected devices from the scan list (assuming we only want to show pairable devices)
	if (isConnected) {
		removeFromDeviceList(mac, setDevices);
	}
}

async function handleNewDevice(
	line: Extract<BluetoothctlLine, { type: LineType.DeviceNew }>,
	discovered: Map<string, string>,
	setDevices: React.Dispatch<React.SetStateAction<Device[]>>
): Promise<void> {
	const mac = line.device.mac;
	const name = line.device.name;

	if (discovered.has(mac)) return;

	discovered.set(mac, name);

	try {
		const info = await Bluetoothctl.getDeviceInfo(mac);
		const icon = getIconFromInfo(info);

		// Only add if not already connected
		const isConnected = BLUETOOTH_REGEX.connectedStatus.test(info);
		if (!isConnected) {
			setDevices((prev) =>
				sortDevices([...prev, { mac, name, icon, connected: false, trusted: false }])
			);
		}
	} catch (error) {
		console.error(`Failed to get info for device ${mac}:`, error);
		// Add device anyway with minimal info
		setDevices((prev) =>
			sortDevices([...prev, { mac, name, icon: "", connected: false, trusted: false }])
		);
	}
}

function useConnectingMonitor() {
	const [connectingDevice, setConnectingDevice] = useState<Device | null>(null);
	const btRef = useRef<Bluetoothctl | null>(null);

	const pairingDeviceRef = useRef<Device | null>(null);
	pairingDeviceRef.current = connectingDevice;

	const handlePairingLine = useCallback(async (line: BluetoothctlLine) => {
		try {
			switch (line.type) {
			}
		} catch (err) {
			console.error("Pairing line error:", err);
			showErrorToast("Failed to handle pairing event", err);
		}
	}, []);

	useEffect(() => {
		const bt = new Bluetoothctl();
		btRef.current = bt;

		bt.onLine(handlePairingLine);

		return () => {
			bt.kill();
		};
	}, [handlePairingLine]);
}

function useScanMonitor() {
	const [bluetoothState, setBluetoothState] = useState<BluetoothState | null>(null);
	const [loading, setLoading] = useState(false);

	const makeScannable = useCallback(async () => {
		setLoading(true);
		try {
			await Bluetoothctl.setDiscoverable("on");
			setBluetoothState(await Bluetoothctl.getControllerInfo());
		} catch (err) {
			console.error("Scanability error:", err);
			showErrorToast("Failed to make device discoverable", err);
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		let cancelled = false;

		const init = async () => {
			try {
				const info = await Bluetoothctl.getControllerInfo();
				if (!cancelled) setBluetoothState(info);
			} catch (err) {
				console.error("Failed to get Bluetooth status:", err);
				showErrorToast("Failed to get Bluetooth status", err);
			}

			if (!cancelled) await makeScannable();
		};

		init();

		return () => {
			console.log("Cancelling scanability");
			cancelled = true;
			Bluetoothctl.setDiscoverable("off");
		};
	}, [makeScannable]);

	return {
		bluetoothState,
		setBluetoothState,
		loading,
		makeScannable,
	};
}

export default function Scan() {
	const [bluetoothState, setBluetoothState] = useState<BluetoothState | null>(null);
	const [devices, setDevices] = useState<Device[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	const processRef = useRef<Bluetoothctl | null>(null);
	const timeoutRef = useRef<NodeJS.Timeout | null>(null);

	const removeDevice = useCallback((mac: string) => {
		removeFromDeviceList(mac, setDevices);
	}, []);

	useEffect(() => {
		const discovered = new Map<string, string>();

		(async () => {
			const bt = new Bluetoothctl();

			setBluetoothState(await Bluetoothctl.getControllerInfo());

			try {
				// Load initial devices (already paired/known devices)
				const initialDevices = await Bluetoothctl.listDevices();
				for (const { mac, name } of initialDevices) {
					discovered.set(mac.toLowerCase(), name);
				}

				// Filter out connected devices from initial scan
				const devicesToAdd = await Promise.all(
					Array.from(discovered.entries()).map(async ([mac, name]) => {
						try {
							const info = await Bluetoothctl.getDeviceInfo(mac);
							// Skip if already connected
							if (BLUETOOTH_REGEX.connectedStatus.test(info)) {
								return null;
							}
							const icon = getIconFromInfo(info);
							return { mac, name, icon, connected: false, trusted: false };
						} catch (error) {
							console.error(`Failed to get info for ${mac}:`, error);
							return { mac, name, icon: "", connected: false, trusted: false };
						}
					})
				);

				const filteredDevices = devicesToAdd.filter(Boolean) as Device[];
				setDevices(sortDevices(filteredDevices));

			} catch (error) {
				console.error("Initial device scan failed:", error);
			}

			processRef.current = bt;

			// Set up the new line handler
			const lineHandler = (line: BluetoothctlLine) => {
				processBluetoothLine(line, discovered, setDevices);
			};

			bt.onLine(lineHandler);
			bt.scanOn();

			// Stop scanning after 30 seconds
			timeoutRef.current = setTimeout(() => {
				bt.scanOff();
				bt.removeLineHandler(lineHandler); // Clean up handler
				bt.kill();
				setIsLoading(false);
			}, 30000);

		})();

		return () => {
			// Cleanup
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
			if (processRef.current) {
				processRef.current.scanOff();
				processRef.current.kill();
			}
			setIsLoading(false);
		};
	}, []);

	if (!bluetoothState?.powered) {
		return <BluetoothPoweredOffView setBluetoothState={setBluetoothState} />;
	}

	return (
		<List isLoading={isLoading} searchBarPlaceholder="Scanning for Bluetooth devices...">
			{!isLoading && devices.length === 0 && (
				<List.EmptyView icon={Icon.Bluetooth} title="No devices found" />
			)}

			{devices.map((device) => (
				<List.Item
					key={device.mac}
					title={device.name}
					subtitle={device.mac}
					icon={device.icon}
					actions={
						<ActionPanel>
							<Action
								title="Pair"
								shortcut={{ modifiers: ["ctrl"], key: "p" }}
								onAction={pairAndConnect(device, removeDevice)}
							/>
							<Action
								title="Connect"
								shortcut={{ modifiers: ["ctrl"], key: "c" }}
								onAction={connect(device, removeDevice)}
							/>
							{TogglePowerAction(bluetoothState, setBluetoothState)}
						</ActionPanel>
					}
				/>
			))}
		</List>
	);
}

// Action handlers remain the same but with better error handling
function pairAndConnect(device: Device, removeDevice: (mac: string) => void) {
	return async () => {
		try {
			await pairToDevice(device);
			await connectToDevice(device);
			removeDevice(device.mac);
		} catch (error) {
			console.error(`Failed to pair and connect to ${device.name}:`, error);
		}
	};
}

function connect(device: Device, removeDevice: (mac: string) => void) {
	return async () => {
		try {
			await connectToDevice(device);
			removeDevice(device.mac);
		} catch (error) {
			console.error(`Failed to connect to ${device.name}:`, error);
		}
	};
}
