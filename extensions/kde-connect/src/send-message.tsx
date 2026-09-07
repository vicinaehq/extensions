import { Action, ActionPanel, Form, Toast, showToast } from "@vicinae/api";
import { useEffect, useState } from "react";
import {
	type KdeDevice,
	finishAndClose,
	getAvailableDevices,
	isKdeConnectNotFoundError,
	sendMessage,
	showKdeError,
} from "./utils/kdeconnect";

export default function SendMessageCommand() {
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
			await showKdeError(new Error(error), "Failed to send SMS");
			return;
		}

		const targetDevice =
			(values.device as string) ||
			selectedDevice ||
			(devices.length > 0 ? devices[0].id : "");
		const destination = (values.destination as string) || "";
		const message = (values.message as string) || "";

		if (!targetDevice) {
			await showToast({
				style: Toast.Style.Failure,
				title: "No device selected",
				message: "Please ensure a KDE Connect device is connected.",
			});
			return;
		}

		if (!destination.trim()) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Phone number required",
				message: "Please enter a destination phone number.",
			});
			return;
		}

		if (!message.trim()) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Message required",
				message: "Please enter a message to send.",
			});
			return;
		}

		const toast = await showToast({
			style: Toast.Style.Animated,
			title: "Sending SMS...",
		});

		try {
			await sendMessage(targetDevice, destination, message);
			toast.style = Toast.Style.Success;
			toast.title = "Message sent successfully!";
			await finishAndClose();
		} catch (error) {
			toast.style = Toast.Style.Failure;
			if (isKdeConnectNotFoundError(error)) {
				toast.title = "kdeconnect-cli not found";
				toast.message = "Install KDE Connect";
			} else {
				toast.title = "Failed to send SMS";
				toast.message = error instanceof Error ? error.message : String(error);
			}
		}
	}

	return (
		<Form
			isLoading={isLoading}
			actions={
				<ActionPanel>
					<Action.SubmitForm title="Send Message" onSubmit={handleSubmit} />
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
					{devices.map((device) => (
						<Form.Dropdown.Item
							key={device.id}
							value={device.id}
							title={device.name}
						/>
					))}
				</Form.Dropdown>
			)}

			{devices.length === 1 && (
				<Form.Description title="Device" text={devices[0].name} />
			)}

			<Form.TextField
				id="destination"
				title="Phone Number"
				placeholder="+1234567890"
				autoFocus={true}
			/>

			<Form.TextArea
				id="message"
				title="Message"
				placeholder="Type your message here..."
			/>
		</Form>
	);
}
