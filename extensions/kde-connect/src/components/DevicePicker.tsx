import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import type { KdeDevice } from "../utils/kdeconnect";

interface DevicePickerProps {
	isLoading?: boolean;
	searchBarPlaceholder?: string;
	devices: KdeDevice[];
	actionTitle?: string;
	includeAllOption?: boolean;
	onSelect: (device: KdeDevice | "all") => Promise<void> | void;
}

export function DevicePicker({
	isLoading = false,
	searchBarPlaceholder = "Select a device...",
	devices,
	actionTitle = "Select Device",
	includeAllOption = true,
	onSelect,
}: DevicePickerProps) {
	return (
		<List isLoading={isLoading} searchBarPlaceholder={searchBarPlaceholder}>
			{devices.map((device) => (
				<List.Item
					key={device.id}
					icon={Icon.Mobile}
					title={device.name}
					subtitle="Press Enter to select"
					actions={
						<ActionPanel>
							<Action title={actionTitle} onAction={() => onSelect(device)} />
						</ActionPanel>
					}
				/>
			))}
			{includeAllOption && devices.length > 1 && (
				<List.Item
					key="all"
					icon={Icon.Devices}
					title="All Devices"
					subtitle={`Select all ${devices.length} connected devices`}
					actions={
						<ActionPanel>
							<Action
								title={`${actionTitle} (All)`}
								onAction={() => onSelect("all")}
							/>
						</ActionPanel>
					}
				/>
			)}
		</List>
	);
}
