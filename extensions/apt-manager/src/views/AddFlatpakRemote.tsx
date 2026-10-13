import {
	Action,
	ActionPanel,
	Form,
	Icon,
	Toast,
	showToast,
	useNavigation,
} from "@vicinae/api";
import { useState } from "react";
import {
	flatpakAppstreamArgs,
	flatpakRemoteAddArgs,
	runFlatpakCommand,
	type FlatpakInstallation,
} from "../lib/flatpakRemotes";

type Props = {
	onAdded?: () => void;
};

export function AddFlatpakRemoteForm({ onAdded }: Props) {
	const { pop } = useNavigation();
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: Form.Values) => {
		const name = String(values.name ?? "").trim();
		const url = String(values.url ?? "").trim();
		const title = String(values.title ?? "").trim();
		const installation = String(
			values.installation ?? "system",
		) as FlatpakInstallation;

		if (name === "" || url === "") {
			await showToast({
				style: Toast.Style.Failure,
				title: "A name and a URL are required",
			});
			return;
		}
		if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Name must be alphanumeric with . _ -",
			});
			return;
		}

		const args = flatpakRemoteAddArgs(installation, name, url, title);
		setIsSubmitting(true);
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: `Adding remote ${name}`,
		});
		const result = await runFlatpakCommand(installation, args, `Add ${name}`);
		setIsSubmitting(false);

		if (!result.ok) {
			toast.style = Toast.Style.Failure;
			toast.title = "Failed to add remote";
			toast.message =
				result.stderr.trim().slice(0, 140) ||
				`exit code ${result.code ?? "unknown"}`;
			return;
		}

		toast.style = Toast.Style.Success;
		toast.title = "Remote added";
		onAdded?.();

		if (Boolean(values.updateNow)) {
			const appstream = await runFlatpakCommand(
				installation,
				flatpakAppstreamArgs(installation, name),
				`Update appstream for ${name}`,
			);
			if (!appstream.ok) {
				await showToast({
					style: Toast.Style.Failure,
					title: `Failed to update appstream for ${name}`,
					message: appstream.stderr.trim().slice(0, 140) || undefined,
				});
			}
		}
		pop();
	};

	return (
		<Form
			navigationTitle="Add Flatpak Remote"
			isLoading={isSubmitting}
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title="Add Remote"
						icon={Icon.Plus}
						onSubmit={onSubmit}
					/>
				</ActionPanel>
			}
		>
			<Form.TextField
				id="name"
				title="Name"
				placeholder="flathub"
				info="The remote identifier used by the flatpak CLI."
				autoFocus
			/>
			<Form.TextField
				id="url"
				title="Repository URL"
				placeholder="https://dl.flathub.org/repo/"
				info="The repository location, or the path to a .flatpakrepo file."
			/>
			<Form.TextField
				id="title"
				title="Title (optional)"
				placeholder="Flathub"
				info="A friendly name shown in the repositories list."
			/>
			<Form.Dropdown
				id="installation"
				title="Installation"
				defaultValue="system"
			>
				<Form.Dropdown.Item title="System-wide" value="system" />
				<Form.Dropdown.Item title="Only this user" value="user" />
			</Form.Dropdown>
			<Form.Checkbox
				id="updateNow"
				label="Update appstream metadata after adding"
				defaultValue={true}
			/>
		</Form>
	);
}
