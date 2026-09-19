import path from "node:path";
import {
	Action,
	ActionPanel,
	Form,
	Icon,
	popToRoot,
	showToast,
	Toast,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { shareFile } from "./lib/client";
import { formatBytes, isPaired } from "./lib/devices/format";
import { useDevices } from "./lib/devices/store";
import { rememberDevice, resolveTarget } from "./lib/devices/target";
import { showKcdError } from "./lib/errors";
import { openWatch } from "./lib/socket";
import {
	type DeviceSummary,
	EventType,
	isRecord,
	type ShareCompletePayload,
	type ShareProgressPayload,
} from "./lib/types";

const ALL_DEVICES = "all";
/** The daemon's own transfer accept timeout defaults to 120s. */
const IDLE_TIMEOUT_MS = 120_000;

type Failure = { device: string; file: string; error: string };
type Outcome = { sent: number; total: number; failures: Failure[] };

function key(deviceId: string, file: string): string {
	return `${deviceId}:${file}`;
}

/**
 * Sends files and reports what actually happened.
 *
 * `shareFile` resolves as soon as the invite packet is queued — the bytes move
 * afterwards, inside the daemon — so awaiting it proves nothing. The only
 * truthful source of progress and completion is the event stream, which is
 * opened before any transfer starts so no early event is missed.
 */
function transfer(
	targets: DeviceSummary[],
	files: string[],
	toast: Toast,
): Promise<Outcome> {
	const total = targets.length * files.length;

	return new Promise<Outcome>((resolve) => {
		const pending = new Set<string>();
		const failures: Failure[] = [];
		const nameById = new Map(targets.map((d) => [d.id, d.name]));
		let idleTimer: ReturnType<typeof setTimeout> | undefined;
		let settled = false;

		const finish = () => {
			if (settled) return;
			settled = true;
			if (idleTimer) clearTimeout(idleTimer);
			watch.close();
			resolve({
				sent: total - failures.length - pending.size,
				total,
				failures,
			});
		};

		const resetIdle = () => {
			if (idleTimer) clearTimeout(idleTimer);
			idleTimer = setTimeout(() => {
				for (const k of pending) {
					const [deviceId, file] = k.split(/:(.*)/s);
					failures.push({
						device: nameById.get(deviceId) ?? deviceId,
						file,
						error: "timed out waiting for the device",
					});
				}
				pending.clear();
				finish();
			}, IDLE_TIMEOUT_MS);
		};

		const watch = openWatch(
			[EventType.ShareProgress, EventType.ShareComplete],
			{
				onReady: () => {
					void (async () => {
						for (const device of targets) {
							for (const file of files) {
								const base = path.basename(file);
								pending.add(key(device.id, base));
								try {
									await shareFile(device.id, file);
								} catch (error) {
									pending.delete(key(device.id, base));
									failures.push({
										device: device.name,
										file: base,
										error:
											error instanceof Error ? error.message : String(error),
									});
								}
							}
						}
						if (pending.size === 0) finish();
						else resetIdle();
					})();
				},

				onEvent: (event) => {
					if (!event.deviceId || !isRecord(event.payload)) return;

					if (event.type === EventType.ShareProgress) {
						const p = event.payload as unknown as ShareProgressPayload;
						toast.message = `${p.file} · ${formatBytes(p.current)} of ${formatBytes(p.total)}`;
						resetIdle();
						return;
					}

					if (event.type === EventType.ShareComplete) {
						const p = event.payload as unknown as ShareCompletePayload;
						const k = key(event.deviceId, p.file);
						if (!pending.delete(k)) return;
						if (!p.success) {
							failures.push({
								device: nameById.get(event.deviceId) ?? event.deviceId,
								file: p.file,
								error: p.error ?? "transfer failed",
							});
						}
						if (pending.size === 0) finish();
						else resetIdle();
					}
				},

				onError: () => finish(),
				onClose: () => finish(),
			},
		);
	});
}

export default function SendFileCommand() {
	const { devices, isLoading, daemonDown } = useDevices();
	const [target, setTarget] = useState<string>("");
	const [isSending, setIsSending] = useState(false);

	const connected = devices.filter((d) => d.connected && isPaired(d));

	useEffect(() => {
		if (target || connected.length === 0) return;
		let active = true;
		void resolveTarget(devices).then((resolution) => {
			if (!active) return;
			setTarget(
				resolution.kind === "resolved" ? resolution.device.id : connected[0].id,
			);
		});
		return () => {
			active = false;
		};
	}, [devices, target, connected]);

	async function handleSubmit(values: Form.Values) {
		const files = (values.files as string[]) ?? [];
		if (files.length === 0) {
			await showToast({
				style: Toast.Style.Failure,
				title: "No files selected",
				message: "Pick at least one file to send",
			});
			return;
		}

		const chosen = (values.device as string) || target;
		const targets =
			chosen === ALL_DEVICES
				? connected
				: connected.filter((d) => d.id === chosen);

		if (targets.length === 0) {
			await showToast({
				style: Toast.Style.Failure,
				title: "No device is connected",
				message: "Connect a device and try again",
			});
			return;
		}

		setIsSending(true);
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: `Sending ${files.length} file${files.length > 1 ? "s" : ""}…`,
		});

		try {
			const outcome = await transfer(targets, files, toast);
			for (const device of targets) await rememberDevice(device.id);

			if (outcome.failures.length === 0) {
				toast.style = Toast.Style.Success;
				toast.title =
					targets.length > 1
						? `Sent to ${targets.length} devices`
						: `Sent to ${targets[0].name}`;
				toast.message = undefined;
				await popToRoot({ clearSearchBar: true });
				return;
			}

			const first = outcome.failures[0];
			toast.style = Toast.Style.Failure;
			toast.title =
				outcome.sent > 0
					? `Sent ${outcome.sent} of ${outcome.total}`
					: "Transfer failed";
			toast.message = `${first.file} to ${first.device}: ${first.error}`;
		} catch (error) {
			await showKcdError(error, "Could not send the files");
		} finally {
			setIsSending(false);
		}
	}

	if (daemonDown) {
		return (
			<Form>
				<Form.Description
					title="kcd daemon is not running"
					text="Start it with: systemctl --user start kcd"
				/>
			</Form>
		);
	}

	return (
		<Form
			isLoading={isLoading || isSending}
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title={target === ALL_DEVICES ? "Send to All Devices" : "Send File"}
						icon={Icon.Upload}
						onSubmit={handleSubmit}
					/>
				</ActionPanel>
			}
		>
			{!isLoading && connected.length === 0 ? (
				<Form.Description
					title="No device is connected"
					text="Open KDE Connect on your phone and make sure it is on the same network."
				/>
			) : null}

			{connected.length > 1 ? (
				<Form.Dropdown
					id="device"
					title="Send To"
					value={target}
					onChange={setTarget}
				>
					<Form.Dropdown.Item
						key={ALL_DEVICES}
						value={ALL_DEVICES}
						title={`All Devices (${connected.length})`}
						icon={Icon.Devices}
					/>
					<Form.Dropdown.Section title="Devices">
						{connected.map((device) => (
							<Form.Dropdown.Item
								key={device.id}
								value={device.id}
								title={device.name}
								icon={Icon.Mobile}
							/>
						))}
					</Form.Dropdown.Section>
				</Form.Dropdown>
			) : null}

			{connected.length === 1 ? (
				<Form.Description title="Send To" text={connected[0].name} />
			) : null}

			<Form.FilePicker
				id="files"
				title="Files"
				canChooseFiles
				canChooseDirectories={false}
				allowMultipleSelection
			/>
		</Form>
	);
}
