import path from "node:path";
import {
	Action,
	ActionPanel,
	Form,
	Icon,
	type LaunchProps,
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

/** One file heading to one device. Duplicates are distinct jobs, not one key. */
type Job = { deviceId: string; deviceName: string; path: string; base: string };

function key(deviceId: string, base: string): string {
	return `${deviceId}\u0000${base}`;
}

/**
 * Sends files and reports what actually happened.
 *
 * `shareFile` resolves as soon as the invite packet is queued — the bytes move
 * afterwards, inside the daemon — so awaiting it proves nothing. The only
 * truthful source of progress and completion is the event stream, which is
 * opened before any transfer starts so no early event is missed.
 *
 * Completion events identify a file only by basename, so jobs are queued per
 * key rather than collapsed into one: sending two files that happen to share a
 * basename needs two completions, not one.
 *
 * A transfer counts as sent only when its own `share.complete` arrives. If the
 * stream dies first, every unconfirmed job becomes a failure — silence is not
 * evidence that bytes moved.
 */
function transfer(
	targets: DeviceSummary[],
	files: string[],
	toast: Toast,
): Promise<Outcome> {
	const jobs: Job[] = targets.flatMap((device) =>
		files.map((file) => ({
			deviceId: device.id,
			deviceName: device.name,
			path: file,
			base: path.basename(file),
		})),
	);
	const total = jobs.length;

	return new Promise<Outcome>((resolve) => {
		/** Jobs dispatched and awaiting completion, queued per key. */
		const outstanding = new Map<string, Job[]>();
		let undispatched = [...jobs];
		const failures: Failure[] = [];
		let idleTimer: ReturnType<typeof setTimeout> | undefined;
		let settled = false;

		const finish = () => {
			if (settled) return;
			settled = true;
			if (idleTimer) clearTimeout(idleTimer);
			watch.close();
			resolve({ sent: total - failures.length, total, failures });
		};

		/** Fails every job whose completion was never observed. */
		const abort = (error: string) => {
			if (settled) return;
			const stranded = [...undispatched, ...[...outstanding.values()].flat()];
			undispatched = [];
			outstanding.clear();
			for (const job of stranded) {
				failures.push({ device: job.deviceName, file: job.base, error });
			}
			finish();
		};

		const resetIdle = () => {
			if (idleTimer) clearTimeout(idleTimer);
			idleTimer = setTimeout(
				() => abort("timed out waiting for the device"),
				IDLE_TIMEOUT_MS,
			);
		};

		const watch = openWatch(
			[EventType.ShareProgress, EventType.ShareComplete],
			{
				onReady: () => {
					void (async () => {
						while (undispatched.length > 0) {
							const job = undispatched.shift() as Job;
							try {
								await shareFile(job.deviceId, job.path);
								const k = key(job.deviceId, job.base);
								outstanding.set(k, [...(outstanding.get(k) ?? []), job]);
							} catch (error) {
								failures.push({
									device: job.deviceName,
									file: job.base,
									error: error instanceof Error ? error.message : String(error),
								});
							}
						}
						if (outstanding.size === 0) finish();
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
						const queue = outstanding.get(k);
						if (!queue || queue.length === 0) return;
						const job = queue.shift() as Job;
						if (queue.length === 0) outstanding.delete(k);

						if (!p.success) {
							failures.push({
								device: job.deviceName,
								file: job.base,
								error: p.error ?? "transfer failed",
							});
						}
						if (outstanding.size === 0) finish();
						else resetIdle();
					}
				},

				onError: (error) => abort(error.message),
				onClose: () => abort("the daemon closed the event stream"),
			},
		);
	});
}

export default function SendFileCommand(props: LaunchProps) {
	const { devices, isLoading, daemonDown } = useDevices();
	const [target, setTarget] = useState<string>("");
	const [isSending, setIsSending] = useState(false);

	const connected = devices.filter((d) => d.connected && isPaired(d));

	// Launched from a device's action panel, the chosen device travels in
	// the launch context; without it the ladder would pick its own target.
	const explicitId =
		typeof props.launchContext?.deviceId === "string"
			? props.launchContext.deviceId
			: undefined;

	useEffect(() => {
		if (target || connected.length === 0) return;
		let active = true;
		void resolveTarget(devices, { explicitId }).then((resolution) => {
			if (!active) return;
			setTarget(
				resolution.kind === "resolved" ? resolution.device.id : connected[0].id,
			);
		});
		return () => {
			active = false;
		};
	}, [devices, target, connected, explicitId]);

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

			// Success is claimed only when every job produced its own completion.
			if (outcome.failures.length === 0 && outcome.sent === outcome.total) {
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
