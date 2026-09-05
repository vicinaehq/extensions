import { Toast, showToast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { DevicePicker } from "./components/DevicePicker";
import {
	type KdeDevice,
	finishAndClose,
	getAvailableDevices,
	sendClipboard,
} from "./utils/kdeconnect";

export default function SendClipboardCommand() {
	const [devices, setDevices] = useState<KdeDevice[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);

	async function executeSend(target: KdeDevice | "all") {
		try {
			if (target === "all") {
				await Promise.all(devices.map((d) => sendClipboard(d.id)));
				await showToast({
					style: Toast.Style.Success,
					title: "Clipboard sent",
					message: `Sent to all ${devices.length} devices`,
				});
			} else {
				await sendClipboard(target.id);
				await showToast({
					style: Toast.Style.Success,
					title: "Clipboard sent",
					message: `Sent to ${target.name}`,
				});
			}
			await finishAndClose();
		} catch (error) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Failed to send clipboard",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	useEffect(() => {
		async function init() {
			const list = await getAvailableDevices();
			if (list.length === 0) {
				await showToast({
					style: Toast.Style.Failure,
					title: "No connected device found",
					message: "Ensure KDE Connect is running on your phone and PC.",
				});
				await finishAndClose();
				return;
			}

			if (list.length === 1) {
				await executeSend(list[0]);
				return;
			}

			setDevices(list);
			setIsLoading(false);
		}

		init();
	}, []);

	return (
		<DevicePicker
			isLoading={isLoading}
			searchBarPlaceholder="Select device to send clipboard to..."
			actionTitle="Send Clipboard"
			devices={devices}
			onSelect={executeSend}
		/>
	);
}
