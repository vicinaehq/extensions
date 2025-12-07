import {
	Action,
	ActionPanel,
	Icon,
	List,
	Toast,
	showToast,
} from "@vicinae/api";
import { Bluetoothctl, BluetoothState } from "@/bluetoothctl";


export function BluetoothPoweredOffView({
	setBluetoothState
}: {
	setBluetoothState: (info: BluetoothState | null) => void
}) {
	return (
		<List
			actions={
				<ActionPanel>
					<Action
						title="Turn on Bluetooth"
						icon={Icon.Power}
						onAction={async () => {
							try {
								const info = await Bluetoothctl.setPower("on");
								setBluetoothState(info);
								await showToast({
									style: Toast.Style.Success,
									title: "Bluetooth turned on",
								});
							} catch (error) {
								await showToast({
									style: Toast.Style.Failure,
									title: "Failed to turn on Bluetooth",
									message: error instanceof Error ? error.message : "Unknown error",
								});
							}
						}}
						shortcut={{ modifiers: ["ctrl"], key: "p" }}
					/>
				</ActionPanel>
			}
		>
			<List.EmptyView
				icon={Icon.Bluetooth}
				title="Bluetooth is not powered on"
				description="Please turn on Bluetooth in the action panel to continue."
			/>
		</List>
	);
}

export function TogglePowerAction({
	bluetoothState,
	setBluetoothState
}: {
	bluetoothState: BluetoothState | null,
	setBluetoothState: (info: BluetoothState | null) => void
}) {
	let power: "on" | "off" = "on";

	if (!bluetoothState) return;

	if (bluetoothState.powered) power = "off";
	return (
		<Action
			title={"Turn " + power + " Bluetooth"}
			icon={Icon.Power}
			onAction={async () => {
				try {
					const info = await Bluetoothctl.setPower(power);
					setBluetoothState(info);
					await showToast({
						style: Toast.Style.Success,
						title: "Bluetooth turned " + power,
					});
				} catch (error) {
					await showToast({
						style: Toast.Style.Failure,
						title: "Failed to turn " + power + " Bluetooth",
						message: error instanceof Error ? error.message : "Unknown error",
					});
				}
			}}
			shortcut={{ modifiers: ["ctrl"], key: "p" }}
		/>
	)
}

export async function showErrorToast(title: string, err: unknown) {
	console.error(title, err);
	await showToast({
		style: Toast.Style.Failure,
		title,
		message: err instanceof Error ? err.message : String(err),
	});
}

export function ScanAction() {
	return (
		<Action.Open
			title="Scan for Devices"
			icon={Icon.Bluetooth}
			target="vicinae://extensions/Damnjelly/bluetooth/scan"
			shortcut={{ modifiers: ["cmd"], key: "s" }}
		/>
	);
}

export function DevicesAction() {
	return (
		<Action.Open
			title="Manage Devices"
			icon={Icon.List}
			target="vicinae://extensions/Damnjelly/bluetooth/devices"
			shortcut={{ modifiers: ["cmd"], key: "m" }}
		/>
	);
}

export function DiscoverAction() {
	return (
		<Action.Open
			title="Discover Devices"
			icon={Icon.Bluetooth}
			target="vicinae://extensions/Damnjelly/bluetooth/discover"
			shortcut={{ modifiers: ["cmd"], key: "d" }}
		/>
	);
}
