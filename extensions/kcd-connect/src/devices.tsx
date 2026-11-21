import {
	Action,
	ActionPanel,
	Icon,
	LaunchType,
	List,
	launchCommand,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { DeviceListItem } from "./components/DeviceListItem";
import { getStatus } from "./lib/client";
import { sortDevices } from "./lib/devices/format";
import { useDevices } from "./lib/devices/store";
import type { StatusResponse } from "./lib/types";

export default function DevicesCommand() {
	const {
		devices,
		isLoading,
		daemonDown,
		defaultDeviceId,
		refresh,
		setDefault,
	} = useDevices();
	const [status, setStatus] = useState<StatusResponse | undefined>();
	const [showDetail, setShowDetail] = useState(true);

	useEffect(() => {
		let active = true;
		getStatus()
			.then((s) => {
				if (active) setStatus(s);
			})
			.catch(() => {
				// The device list is the point of this view; daemon metadata in the
				// detail pane is a bonus and must not block rendering.
			});
		return () => {
			active = false;
		};
	}, []);

	const sorted = sortDevices(devices, defaultDeviceId);
	const connected = sorted.filter((d) => d.connected);
	const offline = sorted.filter((d) => !d.connected);

	if (daemonDown) {
		return (
			<List>
				<List.EmptyView
					icon={Icon.Warning}
					title="kcd daemon is not running"
					description="Start it with: systemctl --user start kcd"
					actions={
						<ActionPanel>
							<Action
								title="Try Again"
								icon={Icon.ArrowClockwise}
								onAction={refresh}
							/>
						</ActionPanel>
					}
				/>
			</List>
		);
	}

	if (!isLoading && devices.length === 0) {
		return (
			<List>
				<List.EmptyView
					icon={Icon.Devices}
					title="No devices yet"
					description="Pair your phone to control it from here."
					actions={
						<ActionPanel>
							<Action
								title="Pair a Device"
								icon={Icon.Link}
								onAction={() =>
									launchCommand({
										name: "pair-device",
										type: LaunchType.UserInitiated,
									})
								}
							/>
						</ActionPanel>
					}
				/>
			</List>
		);
	}

	const render = (id: string) => {
		const device = sorted.find((d) => d.id === id);
		if (!device) return null;
		return (
			<DeviceListItem
				key={device.id}
				device={device}
				isDefault={device.id === defaultDeviceId}
				status={status}
				showDetail={showDetail}
				onToggleDetail={() => setShowDetail((v) => !v)}
				onSetDefault={setDefault}
				onRefresh={refresh}
			/>
		);
	};

	return (
		<List
			isLoading={isLoading}
			isShowingDetail={showDetail}
			searchBarPlaceholder="Search devices…"
		>
			{connected.length > 0 ? (
				<List.Section title="Connected" subtitle={`${connected.length}`}>
					{connected.map((d) => render(d.id))}
				</List.Section>
			) : null}
			{offline.length > 0 ? (
				<List.Section title="Offline" subtitle={`${offline.length}`}>
					{offline.map((d) => render(d.id))}
				</List.Section>
			) : null}
		</List>
	);
}
