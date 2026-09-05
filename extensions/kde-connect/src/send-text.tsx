import { type LaunchProps, Toast, showToast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { DevicePicker } from "./components/DevicePicker";
import {
	type KdeDevice,
	finishAndClose,
	getAvailableDevices,
	sendText,
	showKdeError,
} from "./utils/kdeconnect";

export default function SendTextCommand(
	props: LaunchProps<{ arguments: { text: string } }>,
) {
	const text = props.arguments?.text;
	const [devices, setDevices] = useState<KdeDevice[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);

	async function executeSend(target: KdeDevice | "all") {
		if (!text || !text.trim()) return;

		try {
			if (target === "all") {
				await Promise.all(devices.map((d) => sendText(d.id, text)));
				await showToast({
					style: Toast.Style.Success,
					title: "Text sent",
					message: `Sent to all ${devices.length} devices`,
				});
			} else {
				await sendText(target.id, text);
				await showToast({
					style: Toast.Style.Success,
					title: "Text sent",
					message: `Sent to ${target.name}`,
				});
			}
			await finishAndClose();
		} catch (error) {
			await showKdeError(error, "Failed to send text");
		}
	}

	useEffect(() => {
		async function init() {
			if (!text || !text.trim()) {
				await showToast({
					style: Toast.Style.Failure,
					title: "No text provided",
					message: "Please provide text to send.",
				});
				await finishAndClose();
				return;
			}

			try {
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
			} catch (error) {
				await showKdeError(error, "Failed to load devices");
				await finishAndClose();
			}
		}

		init();
	}, []);

	return (
		<DevicePicker
			isLoading={isLoading}
			searchBarPlaceholder="Select device to send text to..."
			actionTitle="Send Text"
			devices={devices}
			onSelect={executeSend}
		/>
	);
}
