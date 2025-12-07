import React, {
	createContext,
	ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState
} from "react";
import {
	Action,
	ActionPanel,
	Color,
	Icon,
	List,
	getPreferenceValues,
} from "@vicinae/api";
import {
	disconnectFromDevice,
	removeDevice,
	trustDevice,
	connectToDevice,
	fetchDevices,
	BluetoothState,
	DeviceOptions,
	Bluetoothctl,
	Device,
} from "@/bluetoothctl";
import {
	ScanAction,
	DiscoverAction,
	TogglePowerAction,
	showErrorToast
} from "./defaultComponents";

interface Preferences {
	connectionToggleable: boolean;
}

type BluetoothContextState = {
	devices: Device[];
	loading: boolean;
	bluetoothState: BluetoothState | null;
	deviceDetail: boolean;
	refreshDevices: () => Promise<void>;
	connect: (d: Device) => Promise<void>;
	disconnect: (d: Device) => Promise<void>;
	trust: (d: Device) => Promise<void>;
	forget: (d: Device) => Promise<void>;
	toggleDetails: () => void;
	setBluetoothState: (s: BluetoothState | null) => void;
};

const BluetoothContext = createContext<BluetoothContextState | null>(null);

export function BluetoothProvider({ children }: { children: ReactNode }) {
	const [devices, setDevices] = useState<Device[]>([]);
	const [loading, setLoading] = useState(true);
	const [bluetoothState, setBluetoothState] = useState<BluetoothState | null>(null);
	const [details, setDetails] = useState(true);
	const initedRef = useRef(false);

	const refreshDevices = useCallback(async () => {
		setLoading(true);
		try {
			setBluetoothState(await Bluetoothctl.getControllerInfo());
			const list = await fetchDevices(DeviceOptions.PAIRED);
			setDevices(list);
		} catch (error) {
			await showErrorToast("Failed to refresh devices", error);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (initedRef.current) return;
		initedRef.current = true;
		void refreshDevices();
	}, [refreshDevices]);

	const connect = useCallback(async (device: Device) => {
		setLoading(true);
		try {
			await connectToDevice(device);
			await refreshDevices();
		} catch (error) {
			await showErrorToast("Failed to connect to device", error);
		} finally {
			setLoading(false);
		}
	}, [refreshDevices]);

	const disconnect = useCallback(async (device: Device) => {
		setLoading(true);
		try {
			await disconnectFromDevice(device);
			await refreshDevices();
		} catch (error) {
			await showErrorToast("Failed to disconnect from device", error);
		} finally {
			setLoading(false);
		}
	}, [refreshDevices]);

	const trust = useCallback(async (device: Device) => {
		setLoading(true);
		try {
			await trustDevice(device);
			await refreshDevices();
		} catch (error) {
			await showErrorToast("Failed to trust device", error);
		} finally {
			setLoading(false);
		}
	}, [refreshDevices]);

	const forget = useCallback(async (device: Device) => {
		setLoading(true);
		try {
			await removeDevice(device);
			await refreshDevices();
		} catch (error) {
			await showErrorToast("Failed to forget device", error);
		} finally {
			setLoading(false);
		}
	}, [refreshDevices]);

	const toggleDetails = useCallback(() => setDetails((s) => !s), []);

	const contextValue = useMemo(
		() => ({
			devices, loading, bluetoothState, deviceDetail: details,
			refreshDevices, connect, disconnect, trust, forget, toggleDetails, setBluetoothState
		}),
		[devices, loading, bluetoothState, details,
			refreshDevices, connect, disconnect, trust, forget, toggleDetails]
	);

	return <BluetoothContext.Provider value={contextValue}>
		{children}
	</BluetoothContext.Provider>;
}

export function useBluetooth() {
	const ctx = useContext(BluetoothContext);
	if (!ctx) throw new Error("useBluetooth must be used within a BluetoothProvider");
	return ctx;
}

export default function AppDevices() {
	return (
		<BluetoothProvider>
			<Devices />
		</BluetoothProvider>
	);
}

function Devices() {
	const { devices, loading, deviceDetail } = useBluetooth();

	return (
		<List
			isLoading={loading}
			searchBarPlaceholder="Search paired devices..."
			isShowingDetail={deviceDetail}>
			<BluetoothController />
			<List.Section title="Known Devices">
				{devices.map((device) => (
					<DeviceListItem
						key={device.mac}
						device={device} />
				))}
			</List.Section>
		</List>
	);
}

const BluetoothController = React.memo(function BluetoothController() {
	const {
		bluetoothState,
		deviceDetail,
		toggleDetails,
		refreshDevices,
		setBluetoothState
	} = useBluetooth();

	const poweredAccessory = useMemo(
		() =>
			bluetoothState?.powered
				? { text: { value: "Powered", color: Color.Green }, icon: Icon.Checkmark }
				: { text: { value: "Not Powered", color: Color.Orange }, icon: Icon.XMarkCircle },
		[bluetoothState?.powered]
	);

	return (
		<List.Item
			title="Bluetooth Info"
			accessories={!deviceDetail ? [poweredAccessory] : undefined}
			detail={
				<List.Item.Detail
					metadata={
						<List.Item.Detail.Metadata>
							<List.Item.Detail.Metadata.Label
								title="Name"
								text={bluetoothState?.name || "Unknown"}
								icon={{ source: Icon.Bluetooth, tintColor: Color.Blue }} />
							<List.Item.Detail.Metadata.Separator />
							<List.Item.Detail.Metadata.Label
								title="Powered"
								text={bluetoothState?.powered ? "Yes" : "No"}
								icon={{
									source: bluetoothState?.powered
										? Icon.Checkmark
										: Icon.XMarkCircle,
									tintColor: bluetoothState?.powered
										? Color.Green
										: Color.Red
								}} />
							<List.Item.Detail.Metadata.Label
								title="Discoverable"
								text={bluetoothState?.discoverable ? "Yes" : "No"}
								icon={{
									source: bluetoothState?.discoverable
										? Icon.Checkmark
										: Icon.XMarkCircle,
									tintColor: bluetoothState?.discoverable
										? Color.Green
										: Color.Red
								}} />
							<List.Item.Detail.Metadata.Label
								title="Discovering"
								text={bluetoothState?.discovering ? "Yes" : "No"}
								icon={{
									source: bluetoothState?.discovering
										? Icon.Checkmark
										: Icon.XMarkCircle,
									tintColor: bluetoothState?.discovering
										? Color.Green
										: Color.Red
								}} />
							<List.Item.Detail.Metadata.Label
								title="Pairable"
								text={bluetoothState?.pairable ? "Yes" : "No"}
								icon={{
									source: bluetoothState?.pairable
										? Icon.Checkmark
										: Icon.XMarkCircle,
									tintColor: bluetoothState?.pairable
										? Color.Green
										: Color.Red
								}} />
						</List.Item.Detail.Metadata>
					}
				/>
			}
			actions={
				<ActionPanel>
					<Action
						title="Refresh Devices"
						icon={Icon.ArrowClockwise}
						shortcut={{ modifiers: ["cmd"], key: "r" }}
						onAction={refreshDevices} />
					<TogglePowerAction
						bluetoothState={bluetoothState}
						setBluetoothState={setBluetoothState} />
					<ActionPanel.Section>
						<Action
							title="Show Details"
							icon={Icon.Eye}
							onAction={toggleDetails}
							shortcut={{ modifiers: ["cmd"], key: "i" }} />
					</ActionPanel.Section>
					<ActionPanel.Section>
						<ScanAction />
						<DiscoverAction />
					</ActionPanel.Section>
				</ActionPanel>
			}
		/>
	);
});

function DeviceAccessoriesComponent({ device }: { device: Device }) {
	const trustAccessory = {
		text: device.trusted
			? { value: "Trusted", color: Color.Green }
			: { value: "Not Trusted", color: Color.Orange },
		icon: { source: Icon.Lock },
	};

	const connectionAccessory = {
		text: device.connected
			? { value: "Connected", color: Color.Green }
			: { value: "Disconnected", color: Color.Red },
		icon: device.connected ? Icon.Checkmark : Icon.XMarkCircle,
	};

	return [trustAccessory, connectionAccessory];
}

const DeviceActions = React.memo(function DeviceActions({ device }: { device: Device }) {
	const preferences = getPreferenceValues<Preferences>();
	const {
		refreshDevices,
		connect,
		disconnect,
		trust,
		forget,
		toggleDetails
	} = useBluetooth();

	const onToggleConnection = useCallback(async () => {
		try {
			if (device.connected) await disconnect(device);
			else await connect(device);
		} catch (error) {
			console.error(`Failed to toggle connection for ${device.name}:`, error);
		} finally {
			await refreshDevices();
		}
	}, [device, connect, disconnect, refreshDevices]);

	return (
		<>
			{preferences.connectionToggleable ? (
				<Action
					title={device.connected ? "Disconnect" : "Connect"}
					icon={device.connected ? Icon.WifiDisabled : Icon.Wifi}
					style={device.connected ? ("destructive" as any) : undefined}
					shortcut={{ modifiers: ["cmd"], key: "c" }}
					onAction={onToggleConnection}
				/>
			) : (
				<>
					<Action
						title="Connect"
						icon={Icon.Wifi}
						shortcut={{ modifiers: ["cmd"], key: "c" }}
						onAction={() => connect(device)} />
					<Action
						title="Disconnect"
						icon={Icon.WifiDisabled}
						style={("destructive" as any)}
						shortcut={{ modifiers: ["cmd"], key: "d" }}
						onAction={() => disconnect(device)} />
				</>
			)}

			<Action
				title="Trust"
				icon={Icon.Heart}
				shortcut={{ modifiers: ["cmd"], key: "t" }}
				onAction={() => trust(device)} />
			<Action
				title="Forget"
				icon={Icon.HeartDisabled}
				style={("destructive" as any)}
				shortcut={{ modifiers: ["cmd"], key: "f" }}
				onAction={() => forget(device)} />

			<ActionPanel.Section>
				<Action
					title="Show Details"
					icon={Icon.Eye}
					onAction={toggleDetails}
					shortcut={{ modifiers: ["cmd"], key: "i" }} />
				<Action
					title="Refresh Devices"
					icon={Icon.ArrowClockwise}
					shortcut={{ modifiers: ["cmd"], key: "r" }}
					onAction={refreshDevices} />
			</ActionPanel.Section>
			<ActionPanel.Section>
				<ScanAction />
				<DiscoverAction />
			</ActionPanel.Section>
		</>
	);
});

const DeviceListItem = React.memo(function DeviceListItem({ device }: { device: Device }) {
	const { deviceDetail } = useBluetooth();

	return (
		<List.Item
			title={device.name}
			subtitle={device.mac}
			icon={device.icon}
			accessories={!deviceDetail ? DeviceAccessoriesComponent({ device }) : undefined}
			detail={deviceDetail ? <DeviceDetail device={device} /> : undefined}
			actions={
				<ActionPanel>
					<DeviceActions device={device} />
				</ActionPanel>
			}
		/>
	);
});

const DeviceDetail = React.memo(function DeviceDetail({ device }: { device: Device }) {
	return (
		<List.Item.Detail
			metadata={
				<List.Item.Detail.Metadata>
					<List.Item.Detail.Metadata.Label title="Device Name" text={device.name} />
					<List.Item.Detail.Metadata.Label title="MAC Address" text={device.mac} />
					<List.Item.Detail.Metadata.Separator />
					<List.Item.Detail.Metadata.Label
						title="Trust Status"
						text={device.trusted ? "Trusted" : "Not Trusted"}
						icon={{
							source: Icon.Lock,
							tintColor: device.trusted
								? Color.Green
								: Color.Orange
						}} />
					<List.Item.Detail.Metadata.Label
						title="Connection Status"
						text={device.connected ? "Connected" : "Disconnected"}
						icon={{
							source: device.connected
								? Icon.Checkmark
								: Icon.XMarkCircle,
							tintColor: device.connected
								? Color.Green
								: Color.Red
						}} />
				</List.Item.Detail.Metadata>
			}
		/>
	);
});
