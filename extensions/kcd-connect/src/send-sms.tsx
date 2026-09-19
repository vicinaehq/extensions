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
import { listContacts, sendSms, syncContacts } from "./lib/client";
import { isPaired } from "./lib/devices/format";
import { useDevices } from "./lib/devices/store";
import { rememberDevice, resolveTarget } from "./lib/devices/target";
import { showKcdError } from "./lib/errors";
import type { ContactSummary } from "./lib/types";

const MANUAL = "";

export default function SendSmsCommand() {
	const { devices, isLoading, daemonDown } = useDevices();
	const [target, setTarget] = useState<string>("");
	const [contacts, setContacts] = useState<ContactSummary[]>([]);
	const [recipient, setRecipient] = useState("");
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

	useEffect(() => {
		if (!target) return;
		let active = true;
		listContacts(target)
			.then((list) => {
				if (active) setContacts(list);
			})
			.catch(() => {
				// The address book is an assist, not a requirement: a phone that
				// never granted contacts permission should still be able to send.
				if (active) setContacts([]);
			});
		return () => {
			active = false;
		};
	}, [target]);

	async function handleSync() {
		if (!target) return;
		try {
			await syncContacts(target);
			await showToast({
				style: Toast.Style.Success,
				title: "Contact sync requested",
				message: "Reopen this command in a moment to see them",
			});
		} catch (error) {
			await showKcdError(error, "Could not sync contacts");
		}
	}

	async function handleSubmit(values: Form.Values) {
		const deviceId = (values.device as string) || target;
		const number = ((values.recipient as string) || recipient).trim();
		const message = ((values.message as string) || "").trim();

		if (!deviceId) {
			await showToast({
				style: Toast.Style.Failure,
				title: "No device is connected",
				message: "Connect a phone and try again",
			});
			return;
		}
		if (!number) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Recipient required",
				message: "Enter a phone number or pick a contact",
			});
			return;
		}
		if (!message) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Message required",
				message: "Type a message to send",
			});
			return;
		}

		setIsSending(true);
		try {
			await sendSms(deviceId, number, message);
			await rememberDevice(deviceId);
			await showToast({
				style: Toast.Style.Success,
				title: "Message sent",
				message: number,
			});
			await popToRoot({ clearSearchBar: true });
		} catch (error) {
			await showKcdError(error, "Could not send the message");
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

	const withPhones = contacts.filter((c) => (c.phones?.length ?? 0) > 0);

	return (
		<Form
			isLoading={isLoading || isSending}
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title="Send Message"
						icon={Icon.Envelope}
						onSubmit={handleSubmit}
					/>
					{target && withPhones.length === 0 ? (
						<Action
							title="Sync Contacts"
							icon={Icon.ArrowClockwise}
							onAction={handleSync}
						/>
					) : null}
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
					title="Send Via"
					value={target}
					onChange={setTarget}
				>
					{connected.map((device) => (
						<Form.Dropdown.Item
							key={device.id}
							value={device.id}
							title={device.name}
							icon={Icon.Mobile}
						/>
					))}
				</Form.Dropdown>
			) : null}

			{connected.length === 1 ? (
				<Form.Description title="Send Via" text={connected[0].name} />
			) : null}

			{withPhones.length > 0 ? (
				<Form.Dropdown
					id="contact"
					title="Contact"
					onChange={(value) => {
						if (value !== MANUAL) setRecipient(value);
					}}
				>
					<Form.Dropdown.Item value={MANUAL} title="Enter a number manually" />
					<Form.Dropdown.Section title="Contacts">
						{withPhones.map((contact) => (
							<Form.Dropdown.Item
								key={contact.uid}
								value={contact.phones?.[0] ?? ""}
								title={contact.name}
								keywords={contact.phones}
							/>
						))}
					</Form.Dropdown.Section>
				</Form.Dropdown>
			) : null}

			<Form.TextField
				id="recipient"
				title="To"
				placeholder="+1234567890"
				value={recipient}
				onChange={setRecipient}
			/>

			<Form.TextArea
				id="message"
				title="Message"
				placeholder="Type your message…"
			/>

			{withPhones.length === 0 && !isLoading && connected.length > 0 ? (
				<Form.Description
					title="Contacts"
					text="No contacts synced. Your phone may not have granted contacts permission — use Sync Contacts to try again."
				/>
			) : null}
		</Form>
	);
}
