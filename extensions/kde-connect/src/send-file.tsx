import {
	Action,
	ActionPanel,
	Form,
	Icon,
	Toast,
	showToast,
} from "@vicinae/api";
import path from "node:path";
import { useEffect, useState } from "react";
import {
	type KdeDevice,
	finishAndClose,
	getAvailableDevices,
	isKdeConnectNotFoundError,
	sendFiles,
	showKdeError,
} from "./utils/kdeconnect";

export default function SendFileCommand() {
	const [devices, setDevices] = useState<KdeDevice[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [selectedDevice, setSelectedDevice] = useState<string>("");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function loadDevices() {
			setIsLoading(true);
			try {
				const list = await getAvailableDevices();
				setDevices(list);
				if (list.length > 0) {
					setSelectedDevice(list[0].id);
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				setError(msg);
				await showKdeError(err, "Failed to load devices");
			} finally {
				setIsLoading(false);
			}
		}
		loadDevices();
	}, []);

	async function handleSubmit(values: Form.Values) {
		if (error) {
			await showKdeError(new Error(error), "Failed to send files");
			return;
		}

		const targetDevice =
			(values.device as string) ||
			selectedDevice ||
			(devices.length > 0 ? devices[0].id : "");
		const files = (values.files as string[]) || [];

		if (!targetDevice) {
			await showToast({
				style: Toast.Style.Failure,
				title: "No device selected",
				message: "Please ensure a KDE Connect device is connected.",
			});
			return;
		}

		if (!files || files.length === 0) {
			await showToast({
				style: Toast.Style.Failure,
				title: "No files selected",
				message: "Please pick at least one file to send.",
			});
			return;
		}

		const isAll = targetDevice === "all";
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: isAll
				? `Sending ${files.length} file${files.length > 1 ? "s" : ""} to ${devices.length} devices...`
				: `Sending ${files.length} file${files.length > 1 ? "s" : ""}...`,
		});

		try {
			if (isAll) {
				for (let i = 0; i < devices.length; i++) {
					const device = devices[i];
					await sendFiles(device.id, files, (current, total, file) => {
						toast.message = `Sending (${current}/${total}) to ${device.name}: ${path.basename(file)}`;
					});
				}
				toast.style = Toast.Style.Success;
				toast.title = `Sent ${files.length} file${files.length > 1 ? "s" : ""} to all ${devices.length} devices!`;
				toast.message = undefined;
			} else {
				const targetName = devices.find((d) => d.id === targetDevice)?.name;
				await sendFiles(targetDevice, files, (current, total, file) => {
					toast.message = `Sending (${current}/${total}): ${path.basename(file)}`;
				});
				toast.style = Toast.Style.Success;
				toast.title = `Sent ${files.length} file${files.length > 1 ? "s" : ""} successfully!`;
				if (targetName) {
					toast.message = `Sent to ${targetName}`;
				}
			}
			await finishAndClose();
		} catch (error) {
			toast.style = Toast.Style.Failure;
			if (isKdeConnectNotFoundError(error)) {
				toast.title = "kdeconnect-cli not found";
				toast.message = "Install KDE Connect";
			} else {
				toast.title = "Failed to send files";
				toast.message = error instanceof Error ? error.message : String(error);
			}
		}
	}

	return (
		<Form
			isLoading={isLoading}
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title={
							selectedDevice === "all"
								? "Send to All Devices"
								: "Send to Device"
						}
						onSubmit={handleSubmit}
					/>
				</ActionPanel>
			}
		>
			{error && !isLoading && <Form.Description text={error} />}

			{!error && devices.length === 0 && !isLoading && (
				<Form.Description text="No reachable paired devices found. Make sure your phone is connected on the same network and KDE Connect is running." />
			)}

			{devices.length > 1 && (
				<Form.Dropdown
					id="device"
					title="Target Device"
					value={selectedDevice}
					onChange={setSelectedDevice}
				>
					<Form.Dropdown.Item
						key="all"
						value="all"
						title={
							devices.length === 2
								? `Both Devices (${devices.map((d) => d.name).join(", ")})`
								: `All Connected Devices (${devices.length})`
						}
						icon={Icon.Devices}
						keywords={["both", "all", ...devices.map((d) => d.name)]}
					/>
					<Form.Dropdown.Section title="Individual Devices">
						{devices.map((device) => (
							<Form.Dropdown.Item
								key={device.id}
								value={device.id}
								title={device.name}
								icon={Icon.Mobile}
								keywords={[device.name]}
							/>
						))}
					</Form.Dropdown.Section>
				</Form.Dropdown>
			)}

			{devices.length === 1 && (
				<Form.Description title="Device" text={devices[0].name} />
			)}

			<Form.FilePicker
				id="files"
				title="Files"
				canChooseFiles={true}
				canChooseDirectories={false}
				allowMultipleSelection={true}
			/>
		</Form>
	);
}
