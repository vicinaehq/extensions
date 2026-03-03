import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { connectToDevice, type Device, pairToDevice } from "@/bluetooth";
import { startDiscovery, stopDiscovery } from "@/bluez";
import {
	devicePropsToInfoString,
	getBatteryLevel,
	getDeviceProperties,
} from "@/bluez/device";
import {
	listDevices as bluezListDevices,
	subscribeToNewDevices,
	subscribeToRemovedDevices,
} from "@/bluez/discovery";
import { devicePathToMac } from "@/bluez/types";
import {
	getIconFromInfo,
	humanizeBluetoothError,
	isNameMacOnly,
	normalizeMac,
	removeFromDeviceList,
	SCAN_DURATION_MS,
	sortDevices,
} from "@/utils";

const NAME_REFETCH_DELAY_MS = 2_500;

/** Background refetch of device name/icon when name was MAC-only at discovery */
async function refetchDeviceName(
	mac: string,
	setDevices: React.Dispatch<React.SetStateAction<Device[]>>,
	sortDevicesFn: (devices: Device[]) => Device[],
) {
	try {
		const props = await getDeviceProperties(mac);
		const battery = await getBatteryLevel(mac);
		const info = props ? devicePropsToInfoString(props, battery) : "";
		const newName = (props?.Name as string) ?? (props?.Alias as string) ?? mac;
		const trimmed = String(newName).trim() || mac;
		if (isNameMacOnly(trimmed, mac)) return; // Still no friendly name
		const icon = getIconFromInfo(info);
		setDevices((prev) =>
			sortDevicesFn(
				prev.map((d) =>
					normalizeMac(d.mac) === normalizeMac(mac)
						? { ...d, name: trimmed, icon }
						: d,
				),
			),
		);
	} catch {
		// Device may have disappeared, ignore
	}
}

function useBluetoothScanner() {
	const [devices, setDevices] = useState<Device[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [scanTrigger, setScanTrigger] = useState(0);

	const discoveredRef = useRef(new Set<string>());
	const unsubNewRef = useRef<(() => void) | null>(null);
	const unsubRemovedRef = useRef<(() => void) | null>(null);
	const timeoutRef = useRef<NodeJS.Timeout | null>(null);
	const refetchTimeoutsRef = useRef<Set<NodeJS.Timeout>>(new Set());

	const removeDevice = useCallback((mac: string) => {
		removeFromDeviceList(mac, setDevices);
	}, []);

	const rescan = useCallback(() => {
		setScanTrigger((t) => t + 1);
	}, []);

	useEffect(() => {
		discoveredRef.current = new Set<string>();
		setDevices([]);
		setError(null);
		setIsLoading(true);

		(async () => {
			try {
				// Load initial devices from BlueZ
				const initialDevices = await bluezListDevices(false);
				const devicesToAdd: Device[] = [];

				for (const d of initialDevices) {
					const macNorm = normalizeMac(d.mac);
					if (discoveredRef.current.has(macNorm)) continue;
					if (d.connected) continue;

					discoveredRef.current.add(macNorm);
					const props = await getDeviceProperties(d.mac);
					const battery = await getBatteryLevel(d.mac);
					const info = props ? devicePropsToInfoString(props, battery) : "";
					const icon = getIconFromInfo(info);
					const name =
						(props?.Name as string) ??
						(props?.Alias as string) ??
						(typeof d.name === "string" ? d.name : null) ??
						d.mac;
					const device: Device = {
						mac: d.mac,
						name: String(name).trim() || d.mac,
						icon,
						connected: false,
						trusted: false,
					};
					devicesToAdd.push(device);
				}

				setDevices(sortDevices(devicesToAdd));

				// Schedule delayed refetch for MAC-only devices
				for (const device of devicesToAdd) {
					if (isNameMacOnly(device.name, device.mac)) {
						const t = setTimeout(() => {
							refetchTimeoutsRef.current.delete(t);
							refetchDeviceName(device.mac, setDevices, sortDevices);
						}, NAME_REFETCH_DELAY_MS);
						refetchTimeoutsRef.current.add(t);
					}
				}

				// Start D-Bus discovery
				await startDiscovery();

				// Subscribe to new devices
				unsubNewRef.current = await subscribeToNewDevices(async (dev) => {
					const macNorm = normalizeMac(dev.mac);
					if (discoveredRef.current.has(macNorm)) return;
					if (dev.connected) return;

					discoveredRef.current.add(macNorm);
					const props = await getDeviceProperties(dev.mac);
					const battery = await getBatteryLevel(dev.mac);
					const info = props ? devicePropsToInfoString(props, battery) : "";
					const icon = getIconFromInfo(info);
					const name =
						(props?.Name as string) ??
						(props?.Alias as string) ??
						(typeof dev.name === "string" ? dev.name : null) ??
						dev.mac;

					const device: Device = {
						mac: dev.mac,
						name: String(name).trim() || dev.mac,
						icon,
						connected: false,
						trusted: false,
					};
					setDevices((prev) => sortDevices([...prev, device]));

					if (isNameMacOnly(device.name, device.mac)) {
						const t = setTimeout(() => {
							refetchTimeoutsRef.current.delete(t);
							refetchDeviceName(device.mac, setDevices, sortDevices);
						}, NAME_REFETCH_DELAY_MS);
						refetchTimeoutsRef.current.add(t);
					}
				});

				// Subscribe to removed devices
				unsubRemovedRef.current = await subscribeToRemovedDevices((path) => {
					const mac = devicePathToMac(path);
					if (mac) removeFromDeviceList(mac, setDevices);
				});

				// Stop after duration
				timeoutRef.current = setTimeout(async () => {
					unsubNewRef.current?.();
					unsubRemovedRef.current?.();
					await stopDiscovery();
					setIsLoading(false);
				}, SCAN_DURATION_MS);
			} catch (err) {
				console.error("Scan failed:", err);
				const raw = err instanceof Error ? err.message : String(err);
				setError(humanizeBluetoothError(raw) || "Bluetooth adapter not ready");
				setIsLoading(false);
			}
		})();

		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
			for (const t of refetchTimeoutsRef.current) clearTimeout(t);
			refetchTimeoutsRef.current.clear();
			unsubNewRef.current?.();
			unsubRemovedRef.current?.();
			stopDiscovery().catch(() => {});
			setIsLoading(false);
		};
	}, [scanTrigger]);

	return { devices, isLoading, error, removeDevice, rescan };
}

export default function Command() {
	const { devices, isLoading, error, removeDevice, rescan } =
		useBluetoothScanner();

	return (
		<List
			isLoading={isLoading}
			searchBarPlaceholder={
				isLoading ? "Scanning for Bluetooth devices..." : "Search devices..."
			}
			actions={
				!isLoading ? (
					<ActionPanel>
						<Action
							title="Rescan"
							icon={Icon.ArrowClockwise}
							shortcut={{ modifiers: ["cmd"], key: "r" }}
							onAction={rescan}
						/>
					</ActionPanel>
				) : undefined
			}
		>
			{!isLoading && devices.length === 0 && (
				<List.EmptyView
					icon={Icon.Bluetooth}
					title={error ?? "No devices found"}
					description={error ? "Use Rescan to try again" : undefined}
					actions={
						<ActionPanel>
							<Action
								title="Rescan"
								icon={Icon.ArrowClockwise}
								onAction={rescan}
							/>
						</ActionPanel>
					}
				/>
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
							<ActionPanel.Section>
								<Action
									title="Rescan"
									icon={Icon.ArrowClockwise}
									shortcut={{ modifiers: ["cmd"], key: "r" }}
									onAction={rescan}
								/>
							</ActionPanel.Section>
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
