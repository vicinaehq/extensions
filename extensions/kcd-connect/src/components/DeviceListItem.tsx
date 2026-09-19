import {
	Action,
	ActionPanel,
	Color,
	confirmAlert,
	Icon,
	LaunchType,
	List,
	launchCommand,
	showToast,
	Toast,
} from "@vicinae/api";
import {
	mountSftp,
	mprisAction,
	ping,
	pushClipboard,
	ringDevice,
	unmountSftp,
	unpairDevice,
} from "../lib/client";
import {
	batteryColor,
	batteryIcon,
	deviceIcon,
	deviceStatusText,
	formatAgeMs,
	formatBattery,
	formatRelativeTime,
	formatSignal,
	formatTrack,
	isMediaFresh,
	isPaired,
	primarySignal,
	signalIcon,
} from "../lib/devices/format";
import { rememberDevice } from "../lib/devices/target";
import { showKcdError } from "../lib/errors";
import type { DeviceSummary, StatusResponse } from "../lib/types";

type Props = {
	device: DeviceSummary;
	isDefault: boolean;
	status?: StatusResponse;
	showDetail: boolean;
	onToggleDetail: () => void;
	onSetDefault: (deviceId: string) => Promise<void>;
	onRefresh: () => Promise<void>;
};

function accessories(device: DeviceSummary): List.Item.Accessory[] {
	const items: List.Item.Accessory[] = [];

	if (isMediaFresh(device.media)) {
		items.push({
			icon: device.media.isPlaying ? Icon.Play : Icon.Pause,
			tooltip: formatTrack(device.media),
		});
	}

	const signal = primarySignal(device);
	if (signal) {
		items.push({
			icon: signalIcon(signal.signalStrength),
			tooltip: formatSignal(signal),
		});
	}

	if (device.battery) {
		const { charge, charging } = device.battery;
		items.push({
			icon: {
				source: batteryIcon(charge, charging),
				tintColor: batteryColor(charge, charging),
			},
			text: formatBattery(device),
		});
	}

	return items;
}

function detail(device: DeviceSummary, status?: StatusResponse) {
	const signal = primarySignal(device);
	const media = isMediaFresh(device.media) ? device.media : undefined;

	return (
		<List.Item.Detail
			metadata={
				<List.Item.Detail.Metadata>
					<List.Item.Detail.Metadata.Label
						title="Status"
						text={device.connected ? "Connected" : "Offline"}
						icon={{
							source: device.connected ? Icon.CheckCircle : Icon.XMarkCircle,
							tintColor: device.connected ? Color.Green : Color.SecondaryText,
						}}
					/>
					<List.Item.Detail.Metadata.Label
						title="Pairing"
						text={isPaired(device) ? "Paired" : device.state}
					/>
					{device.battery ? (
						<List.Item.Detail.Metadata.Label
							title="Battery"
							text={`${formatBattery(device)} · read ${formatAgeMs(
								device.battery.batteryAgeMs,
							)}`}
							icon={{
								source: batteryIcon(
									device.battery.charge,
									device.battery.charging,
								),
								tintColor: batteryColor(
									device.battery.charge,
									device.battery.charging,
								),
							}}
						/>
					) : null}
					{signal ? (
						<List.Item.Detail.Metadata.Label
							title="Signal"
							text={formatSignal(signal)}
							icon={signalIcon(signal.signalStrength)}
						/>
					) : null}
					{media ? (
						<List.Item.Detail.Metadata.Label
							title="Now Playing"
							text={formatTrack(media)}
							icon={media.isPlaying ? Icon.Play : Icon.Pause}
						/>
					) : null}
					<List.Item.Detail.Metadata.Separator />
					<List.Item.Detail.Metadata.Label title="Type" text={device.type} />
					<List.Item.Detail.Metadata.Label
						title="Last Seen"
						text={formatRelativeTime(device.last_seen)}
					/>
					<List.Item.Detail.Metadata.Label title="Device ID" text={device.id} />
					{device.cert_fp ? (
						<List.Item.Detail.Metadata.Label
							title="Certificate"
							text={`${device.cert_fp.slice(0, 24)}…`}
						/>
					) : null}
					{status ? (
						<>
							<List.Item.Detail.Metadata.Separator />
							<List.Item.Detail.Metadata.Label
								title="Daemon"
								text={`kcd ${status.version} · up ${status.uptimeHuman}`}
							/>
							<List.Item.Detail.Metadata.Label
								title="Plugins"
								text={`${status.plugins.length} enabled`}
							/>
						</>
					) : null}
				</List.Item.Detail.Metadata>
			}
		/>
	);
}

export function DeviceListItem({
	device,
	isDefault,
	status,
	showDetail,
	onToggleDetail,
	onSetDefault,
	onRefresh,
}: Props) {
	async function run(
		failureTitle: string,
		successTitle: string,
		fn: () => Promise<void>,
	) {
		try {
			await fn();
			await rememberDevice(device.id);
			await showToast({
				style: Toast.Style.Success,
				title: successTitle,
				message: device.name,
			});
		} catch (error) {
			await showKcdError(error, failureTitle);
		}
	}

	async function media(action: string, failureTitle: string) {
		if (!isMediaFresh(device.media)) return;
		const player = device.media.player;
		await run(failureTitle, "Sent to player", async () => {
			await mprisAction({ deviceId: device.id, player, action });
			// Some phone MPRIS implementations stop playback on a track change.
			if (action === "Next" || action === "Previous") {
				await mprisAction({ deviceId: device.id, player, action: "Play" });
			}
		});
	}

	async function confirmUnpair() {
		const confirmed = await confirmAlert({
			title: `Unpair ${device.name}?`,
			message: "You will have to pair the device again to reconnect it.",
		});
		if (!confirmed) return;
		await run("Could not unpair", "Unpaired", () => unpairDevice(device.id));
		await onRefresh();
	}

	const playable = isMediaFresh(device.media) ? device.media : undefined;

	return (
		<List.Item
			icon={deviceIcon(device)}
			title={device.name}
			// The detail pane squeezes the list column, so a subtitle there would
			// only ever render truncated — the pane already says all of this.
			subtitle={showDetail ? undefined : deviceStatusText(device)}
			accessories={[
				...(isDefault
					? [{ tag: { value: "Default", color: Color.Blue } }]
					: []),
				...(showDetail && !device.connected
					? [{ tag: { value: "Offline", color: Color.SecondaryText } }]
					: []),
				...accessories(device),
			]}
			detail={showDetail ? detail(device, status) : undefined}
			actions={
				<ActionPanel>
					{device.connected ? (
						<>
							<ActionPanel.Section title="Send">
								<Action
									title="Send Clipboard"
									icon={Icon.CopyClipboard}
									onAction={() =>
										run("Could not send the clipboard", "Clipboard sent", () =>
											pushClipboard(device.id),
										)
									}
								/>
								<Action
									title="Send File…"
									icon={Icon.Upload}
									onAction={() =>
										launchCommand({
											name: "send-file",
											type: LaunchType.UserInitiated,
										})
									}
								/>
								<Action
									title="Send SMS…"
									icon={Icon.Envelope}
									onAction={() =>
										launchCommand({
											name: "send-sms",
											type: LaunchType.UserInitiated,
										})
									}
								/>
							</ActionPanel.Section>

							<ActionPanel.Section title="Device">
								<Action
									title="Ring"
									icon={Icon.PhoneRinging}
									onAction={() =>
										run("Could not ring the device", "Ringing", () =>
											ringDevice(device.id),
										)
									}
								/>
								<Action
									title="Ping"
									icon={Icon.Bell}
									onAction={() =>
										run("Could not ping the device", "Ping sent", () =>
											ping(device.id),
										)
									}
								/>
							</ActionPanel.Section>

							{playable ? (
								<ActionPanel.Section title="Media">
									{playable.canPause || playable.canPlay ? (
										<Action
											title={playable.isPlaying ? "Pause" : "Play"}
											icon={playable.isPlaying ? Icon.Pause : Icon.Play}
											onAction={() =>
												media("PlayPause", "Could not control playback")
											}
										/>
									) : null}
									{playable.canGoNext ? (
										<Action
											title="Next Track"
											icon={Icon.Forward}
											onAction={() => media("Next", "Could not skip track")}
										/>
									) : null}
									{playable.canGoPrevious ? (
										<Action
											title="Previous Track"
											icon={Icon.Rewind}
											onAction={() => media("Previous", "Could not skip track")}
										/>
									) : null}
								</ActionPanel.Section>
							) : null}

							<ActionPanel.Section title="Files">
								<Action
									title="Mount via SFTP"
									icon={Icon.HardDrive}
									onAction={() =>
										run("Could not mount the device", "Mounting", () =>
											mountSftp(device.id),
										)
									}
								/>
								<Action
									title="Unmount"
									icon={Icon.Eject}
									onAction={() =>
										run("Could not unmount the device", "Unmounted", () =>
											unmountSftp(device.id),
										)
									}
								/>
							</ActionPanel.Section>
						</>
					) : (
						<ActionPanel.Section title="Offline">
							<Action
								title="This Device Is Offline"
								icon={Icon.Warning}
								onAction={() =>
									showToast({
										style: Toast.Style.Failure,
										title: `${device.name} is offline`,
										message: "Open KDE Connect on the device to reconnect",
									})
								}
							/>
						</ActionPanel.Section>
					)}

					<ActionPanel.Section title="Manage">
						{isDefault ? null : (
							<Action
								title="Set as Default Device"
								icon={Icon.Star}
								onAction={async () => {
									await onSetDefault(device.id);
									await showToast({
										style: Toast.Style.Success,
										title: "Default device set",
										message: device.name,
									});
								}}
							/>
						)}
						<Action.CopyToClipboard
							title="Copy Device ID"
							content={device.id}
							icon={Icon.CopyClipboard}
						/>
						<Action
							title={showDetail ? "Hide Details" : "Show Details"}
							icon={showDetail ? Icon.EyeDisabled : Icon.Eye}
							shortcut={{ modifiers: ["ctrl"], key: "d" }}
							onAction={onToggleDetail}
						/>
						<Action
							title="Refresh"
							icon={Icon.ArrowClockwise}
							onAction={onRefresh}
						/>
						<Action
							title="Unpair…"
							icon={Icon.Trash}
							style={Action.Style.Destructive}
							onAction={confirmUnpair}
						/>
					</ActionPanel.Section>
				</ActionPanel>
			}
		/>
	);
}
