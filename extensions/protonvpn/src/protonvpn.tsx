import { List, ActionPanel, Action, Icon, Color, showToast, Toast } from "@vicinae/api";
import { useState, useEffect } from "react";
import {
	connectVPN,
	disconnectVPN,
	getVPNStatus,
	reconnectVPN,
	CONNECT_DELAY,
	DISCONNECT_DELAY,
	type VPNStatus
} from "./utils";
import DetailedStatus from "./status";

export default function Command() {
	const [vpn, setVpn] = useState<VPNStatus | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	async function updateAll() {
		setIsLoading(true);
		const vStatus = await getVPNStatus();
		setVpn(vStatus);
		setIsLoading(false);
	}

	useEffect(() => {
		updateAll();
	}, []);

	const handleAction = async (
		task: () => Promise<void | string>,
								actionTitle: string,
							 successMessage: string,
							 delay: number = 0
	) => {
		try {
			setIsLoading(true);
			await showToast({
				style: Toast.Style.Animated,
				title: `${actionTitle}...`
			});

			await task();

			// Wait for system state change if needed
			if (delay > 0) {
				await new Promise(r => setTimeout(r, delay));
			}

			await updateAll();

			// Verify state after action
			const newStatus = await getVPNStatus();
			await showToast({
				style: Toast.Style.Success,
				title: successMessage,
				message: newStatus.server || undefined
			});
		} catch (e) {
			setIsLoading(false);
			showToast({
				style: Toast.Style.Failure,
				title: `${actionTitle} Failed`,
				message: e instanceof Error ? e.message : String(e)
			});
		}
	};

	const toggleVPN = async () => {
		try {
			setIsLoading(true);
			const current = await getVPNStatus();

			if (current.isConnected) {
				await showToast({
					style: Toast.Style.Animated,
					title: "Disconnecting...",
					message: `From ${current.server || "ProtonVPN"}`
				});
				await disconnectVPN();

				// Wait for system to drop the 'proton0' interface
				await new Promise(r => setTimeout(r, DISCONNECT_DELAY));

				// Verify disconnection
				const newStatus = await getVPNStatus();
				if (!newStatus.isConnected) {
					await showToast({
						style: Toast.Style.Success,
						title: "Disconnected",
						message: "ProtonVPN connection closed"
					});
				} else {
					await showToast({
						style: Toast.Style.Failure,
						title: "Disconnection Failed",
						message: "VPN still appears connected"
					});
				}
			} else {
				await showToast({
					style: Toast.Style.Animated,
					title: "Connecting...",
					message: "Finding fastest server"
				});
				await connectVPN();

				// Wait for WireGuard handshake to complete
				await new Promise(r => setTimeout(r, CONNECT_DELAY));

				// Verify connection
				const newStatus = await getVPNStatus();
				if (newStatus.isConnected) {
					await showToast({
						style: Toast.Style.Success,
						title: "Connected",
						message: newStatus.server || "ProtonVPN connection established"
					});
				} else {
					await showToast({
						style: Toast.Style.Failure,
						title: "Connection Failed",
						message: "Unable to establish VPN connection"
					});
				}
			}

			// Refresh the state
			await updateAll();
		} catch (e) {
			setIsLoading(false);
			showToast({
				style: Toast.Style.Failure,
				title: "Toggle Failed",
				message: e instanceof Error ? e.message : String(e)
			});
		}
	};

	const handleConnect = async () => {
		const current = await getVPNStatus();
		if (current.isConnected) {
			showToast({
				style: Toast.Style.Failure,
				title: "Already Connected",
				message: `Currently connected to ${current.server || "ProtonVPN"}`
			});
			return;
		}
		await handleAction(
			connectVPN,
			"Connecting",
			"Connected Successfully",
			CONNECT_DELAY
		);
	};

	const handleDisconnect = async () => {
		const current = await getVPNStatus();
		if (!current.isConnected) {
			showToast({
				style: Toast.Style.Failure,
				title: "Not Connected",
				message: "ProtonVPN is already disconnected"
			});
			return;
		}
		await handleAction(
			disconnectVPN,
			"Disconnecting",
			"Disconnected Successfully",
			DISCONNECT_DELAY
		);
	};

	const handleReconnect = async () => {
		await handleAction(
			reconnectVPN,
			"Changing Server",
			"Server Changed Successfully",
			CONNECT_DELAY
		);
	};

	return (
		<List isLoading={isLoading} searchBarPlaceholder="Manage ProtonVPN">
		<List.Section title="Current Connection">
		<List.Item
		title={vpn?.isConnected ? "Connected" : "Disconnected"}
		subtitle={vpn?.isConnected ? `Server: ${vpn.server || "WireGuard"}` : "Offline"}
		icon={{
			source: vpn?.isConnected ? Icon.CheckCircle : Icon.XMarkCircle,
			tintColor: vpn?.isConnected ? Color.Green : Color.Red
		}}
		actions={
			<ActionPanel>
			<Action.Push
			title="View Detailed Status"
			icon={Icon.Info}
			target={<DetailedStatus />}
			/>
			<Action
			title="Refresh"
			icon={Icon.Repeat}
			onAction={updateAll}
			/>
			</ActionPanel>
		}
		/>
		</List.Section>

		<List.Section title="Commands">
		<List.Item
		title="Toggle VPN"
		subtitle={vpn?.isConnected ? "Disconnect" : "Connect"}
		icon={Icon.Switch}
		actions={
			<ActionPanel>
			<Action
			title={vpn?.isConnected ? "Disconnect" : "Connect"}
			icon={Icon.Switch}
			onAction={toggleVPN}
			/>
			</ActionPanel>
		}
		/>
		<List.Item
		title="Connect VPN"
		subtitle="Connect to fastest server"
		icon={Icon.Wifi}
		actions={
			<ActionPanel>
			<Action
			title="Connect"
			icon={Icon.Wifi}
			onAction={handleConnect}
			/>
			</ActionPanel>
		}
		/>
		<List.Item
		title="Disconnect VPN"
		subtitle="Close VPN connection"
		icon={Icon.WifiDisabled}
		actions={
			<ActionPanel>
			<Action
			title="Disconnect"
			icon={Icon.WifiDisabled}
			onAction={handleDisconnect}
			/>
			</ActionPanel>
		}
		/>
		{/* ONLY show Change Server if currently connected */}
		{vpn?.isConnected && (
			<List.Item
			title="Change Server"
			subtitle="Reconnect to a fresh server"
			icon={Icon.ArrowClockwise}
			actions={
				<ActionPanel>
				<Action
				title="Change Server"
				icon={Icon.ArrowClockwise}
				onAction={handleReconnect}
				/>
				</ActionPanel>
			}
			/>
		)}
		</List.Section>
		</List>
	);
}
