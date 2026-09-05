import { Toast, showToast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { DevicePicker } from "./components/DevicePicker";
import {
	type KdeDevice,
	finishAndClose,
	getAvailableDevices,
	ringPhone,
} from "./utils/kdeconnect";

export default function RingPhoneCommand() {
	const [devices, setDevices] = useState<KdeDevice[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);

	async function executeRing(target: KdeDevice | "all") {
		try {
			if (target === "all") {
				await Promise.all(devices.map((d) => ringPhone(d.id)));
				await showToast({
					style: Toast.Style.Success,
					title: "Ringing all devices",
					message: `Triggered ring on ${devices.length} devices`,
				});
			} else {
				await ringPhone(target.id);
				await showToast({
					style: Toast.Style.Success,
					title: "Ringing phone",
					message: `Triggered ring on ${target.name}`,
				});
			}
			await finishAndClose();
		} catch (error) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Failed to ring device",
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
				await executeRing(list[0]);
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
			searchBarPlaceholder="Select which device to ring..."
			actionTitle="Ring Device"
			devices={devices}
			onSelect={executeRing}
		/>
	);
}
