import {
	Action,
	ActionPanel,
	Color,
	Detail,
	Icon,
	List,
	showToast,
	Toast,
	useNavigation,
} from "@vicinae/api";
import { useEffect, useRef, useState } from "react";
import {
	listenForPairing,
	pairDevice,
	startBroadcast,
	stopBroadcast,
} from "./lib/client";
import { deviceIcon, formatRelativeTime } from "./lib/devices/format";
import { useDevices } from "./lib/devices/store";
import { showKcdError } from "./lib/errors";
import type { DeviceSummary, PairListenResult } from "./lib/types";

function pairingStateText(device: DeviceSummary): string {
	switch (device.state) {
		case "PAIR_REQUESTED_BY_PEER":
			return "Wants to pair with this computer";
		case "PAIR_REQUESTED":
			return "Waiting for the device to accept";
		default:
			return device.connected
				? "Discovered on this network"
				: `Not paired · last seen ${formatRelativeTime(device.last_seen)}`;
	}
}

/**
 * Comparing the key against the one on the phone is the only defence against a
 * machine-in-the-middle pairing, so it gets the whole screen.
 */
function ConfirmPairing({
	candidate,
	onDone,
}: {
	candidate: PairListenResult;
	onDone: () => void;
}) {
	const { pop } = useNavigation();

	// A request already waiting carries only a fingerprint; the key exists
	// solely on the live pair event.
	const secret = candidate.verificationKey || candidate.fingerprint || "";
	const kind = candidate.verificationKey ? "key" : "fingerprint";

	const markdown = [
		`# ${candidate.deviceName}`,
		"",
		secret
			? `This device is asking to pair. Check that the ${kind} below is **exactly** the one shown on the device before you accept.`
			: "This request arrived with no verification key and no certificate fingerprint, so there is nothing to compare it against and it cannot be accepted here. Dismiss it and pair again from the device.",
		"",
		secret ? `## \`${secret}\`` : "",
	].join("\n");

	async function accept() {
		try {
			await pairDevice(candidate.deviceId);
			await showToast({
				style: Toast.Style.Success,
				title: "Paired",
				message: candidate.deviceName,
			});
			onDone();
			pop();
		} catch (error) {
			await showKcdError(error, "Could not complete pairing");
		}
	}

	return (
		<Detail
			markdown={markdown}
			actions={
				<ActionPanel>
					{secret ? (
						<Action
							title={`${kind === "key" ? "Keys" : "Fingerprints"} Match, Pair`}
							icon={Icon.Check}
							onAction={accept}
						/>
					) : null}
					<Action title="Cancel" icon={Icon.Xmark} onAction={pop} />
				</ActionPanel>
			}
		/>
	);
}

export default function PairDeviceCommand() {
	const { devices, isLoading, daemonDown, refresh } = useDevices();
	const { push } = useNavigation();
	const [discoverable, setDiscoverable] = useState(false);
	const [listening, setListening] = useState(false);
	const discoverableRef = useRef(false);

	// Discovery is a deliberate, temporary exposure of this machine; leaving it
	// on after the view closes would keep advertising to the whole network.
	useEffect(() => {
		return () => {
			if (discoverableRef.current) void stopBroadcast();
		};
	}, []);

	async function toggleDiscoverable() {
		try {
			if (discoverable) {
				await stopBroadcast();
				discoverableRef.current = false;
				setDiscoverable(false);
				await showToast({
					style: Toast.Style.Success,
					title: "Discovery stopped",
				});
				return;
			}
			await startBroadcast();
			discoverableRef.current = true;
			setDiscoverable(true);
			await showToast({
				style: Toast.Style.Success,
				title: "Discoverable",
				message: "This computer is now visible to nearby devices",
			});
		} catch (error) {
			await showKcdError(error, "Could not change discovery");
		}
	}

	async function waitForRequest() {
		setListening(true);
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: "Waiting for a pairing request…",
			message: "Tap this computer in KDE Connect on your device",
		});
		try {
			const candidate = await listenForPairing();
			toast.style = Toast.Style.Success;
			toast.title = `${candidate.deviceName} is requesting to pair`;
			toast.message = undefined;
			push(<ConfirmPairing candidate={candidate} onDone={refresh} />);
		} catch (error) {
			toast.hide();
			await showKcdError(error, "No pairing request received");
		} finally {
			setListening(false);
		}
	}

	/**
	 * `pair_listen` reports a waiting request without accepting it, so reading
	 * the candidate before confirmation costs nothing.
	 */
	async function reviewIncoming(device: DeviceSummary) {
		setListening(true);
		try {
			const candidate = await listenForPairing();
			if (candidate.deviceId !== device.id) {
				await showToast({
					style: Toast.Style.Failure,
					title: "A different device is requesting to pair",
					message: `Review the request from ${candidate.deviceName} first`,
				});
				await refresh();
				return;
			}
			push(<ConfirmPairing candidate={candidate} onDone={refresh} />);
		} catch (error) {
			await showKcdError(error, "Could not read the pairing request");
		} finally {
			setListening(false);
		}
	}

	async function requestPairing(device: DeviceSummary) {
		try {
			await pairDevice(device.id);
			await showToast({
				style: Toast.Style.Success,
				title: "Pair request sent",
				message: `Accept it on ${device.name}`,
			});
			await refresh();
		} catch (error) {
			await showKcdError(error, "Could not pair the device");
		}
	}

	const pending = devices.filter((d) => d.state !== "PAIRED");

	const globalActions = (
		<ActionPanel.Section title="Discovery">
			<Action
				title={
					discoverable
						? "Stop Making Discoverable"
						: "Make This Device Discoverable"
				}
				icon={discoverable ? Icon.EyeDisabled : Icon.Eye}
				onAction={toggleDiscoverable}
			/>
			<Action
				title="Wait for a Pairing Request"
				icon={Icon.Bell}
				onAction={waitForRequest}
			/>
			<Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refresh} />
		</ActionPanel.Section>
	);

	if (daemonDown) {
		return (
			<List>
				<List.EmptyView
					icon={Icon.Warning}
					title="kcd daemon is not running"
					description="Start it with: systemctl --user start kcd"
				/>
			</List>
		);
	}

	return (
		<List
			isLoading={isLoading || listening}
			searchBarPlaceholder="Search nearby devices…"
		>
			{discoverable ? (
				<List.Section title="Discovery">
					<List.Item
						icon={{ source: Icon.Wifi, tintColor: Color.Green }}
						title="This computer is discoverable"
						subtitle="Open KDE Connect on your device and select this computer"
						actions={<ActionPanel>{globalActions}</ActionPanel>}
					/>
				</List.Section>
			) : null}

			{pending.length > 0 ? (
				<List.Section title="Nearby" subtitle={`${pending.length}`}>
					{pending.map((device) => (
						<List.Item
							key={device.id}
							icon={deviceIcon(device)}
							title={device.name}
							subtitle={pairingStateText(device)}
							accessories={
								device.state === "PAIR_REQUESTED_BY_PEER"
									? [{ tag: { value: "Wants to pair", color: Color.Orange } }]
									: []
							}
							actions={
								<ActionPanel>
									<ActionPanel.Section title="Pairing">
										<Action
											title={
												device.state === "PAIR_REQUESTED_BY_PEER"
													? "Accept Pairing"
													: "Pair with This Device"
											}
											icon={Icon.Link}
											onAction={() =>
												device.state === "PAIR_REQUESTED_BY_PEER"
													? reviewIncoming(device)
													: requestPairing(device)
											}
										/>
										<Action.CopyToClipboard
											title="Copy Device ID"
											content={device.id}
											icon={Icon.CopyClipboard}
										/>
									</ActionPanel.Section>
									{globalActions}
								</ActionPanel>
							}
						/>
					))}
				</List.Section>
			) : null}

			{!isLoading && pending.length === 0 && !discoverable ? (
				<List.EmptyView
					icon={Icon.Link}
					title="No devices waiting to pair"
					description="Make this computer discoverable, then select it in KDE Connect on your phone."
					actions={<ActionPanel>{globalActions}</ActionPanel>}
				/>
			) : null}
		</List>
	);
}
