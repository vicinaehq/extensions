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
import { installAppImage } from "../lib/appimage";

export function InstallAppImageView() {
	const { pop } = useNavigation();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [sourceType, setSourceType] = useState<"url" | "file">("url");

	const onSubmit = async (values: Form.Values) => {
		const source = String(values.sourceType ?? "url") as "url" | "file";
		const input = String(values.input ?? "").trim();
		if (!input) {
			await showToast({
				style: Toast.Style.Failure,
				title: "A URL or file path is required",
			});
			return;
		}
		setIsSubmitting(true);
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: source === "url" ? "Downloading AppImage" : "Installing AppImage",
		});
		const result = source === "url"
			? await installAppImage({ type: "url", url: input })
			: await installAppImage({ type: "file", path: input });
		setIsSubmitting(false);

		if (!result.ok) {
			toast.style = Toast.Style.Failure;
			toast.title = "Installation failed";
			toast.message = result.error ?? undefined;
			return;
		}

		toast.style = Toast.Style.Success;
		toast.title = "AppImage installed";
		pop();
	};

	return (
		<Form
			navigationTitle="Install AppImage"
			isLoading={isSubmitting}
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title="Install"
						icon={Icon.Plus}
						onSubmit={onSubmit}
					/>
				</ActionPanel>
			}
		>
			<Form.Dropdown
				id="sourceType"
				title="Source"
				defaultValue={sourceType}
			>
				<Form.Dropdown.Item
					title="Download from URL"
					value="url"
				/>
				<Form.Dropdown.Item title="Install from File" value="file" />
			</Form.Dropdown>
			<Form.TextField
				id="input"
				title={sourceType === "url" ? "URL" : "File Path"}
				placeholder={
					sourceType === "url"
						? "https://example.com/MyApp.AppImage"
						: "/path/to/MyApp.AppImage"
				}
				info={
					sourceType === "url"
						? "The URL to download the AppImage from."
						: "Path to a local AppImage file to copy to ~/Applications."
				}
				autoFocus
			/>
		</Form>
	);
}
