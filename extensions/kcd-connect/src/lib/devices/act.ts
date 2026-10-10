import { showToast, Toast } from "@vicinae/api";
import { listDevices } from "../client";
import { showKcdError } from "../errors";
import type { DeviceSummary } from "../types";
import { formatRelativeTime } from "./format";
import { rememberDevice, resolveTarget } from "./target";

type Messages = {
	failureTitle: string;
	success: (device: DeviceSummary) => { title: string; message?: string };
};

/**
 * Runs an action against the resolved target device, for `no-view` commands.
 *
 * These commands have no React tree, so they cannot fall back to a picker when
 * the target is ambiguous. Instead of guessing — which would silently ring the
 * wrong phone — they say what is ambiguous and how to settle it permanently.
 */
export async function performOnTarget(
	run: (device: DeviceSummary) => Promise<void>,
	messages: Messages,
): Promise<void> {
	try {
		const devices = await listDevices();
		const target = await resolveTarget(devices);

		if (target.kind === "none") {
			if (target.reason === "no-devices") {
				await showToast({
					style: Toast.Style.Failure,
					title: "No paired devices",
					message: "Pair a device first with the Pair Device command",
				});
				return;
			}

			const recent = [...devices].sort(
				(a, b) => Date.parse(b.last_seen) - Date.parse(a.last_seen),
			)[0];
			await showToast({
				style: Toast.Style.Failure,
				title: "No device is connected",
				message: recent
					? `${recent.name} was last seen ${formatRelativeTime(recent.last_seen)}`
					: undefined,
			});
			return;
		}

		if (target.kind === "ambiguous") {
			await showToast({
				style: Toast.Style.Failure,
				title: "Multiple devices connected",
				message: "Open Devices to pick one, or set a default device",
			});
			return;
		}

		const device = target.device;
		await run(device);
		await rememberDevice(device.id);

		const { title, message } = messages.success(device);
		await showToast({ style: Toast.Style.Success, title, message });
	} catch (error) {
		await showKcdError(error, messages.failureTitle);
	}
}
