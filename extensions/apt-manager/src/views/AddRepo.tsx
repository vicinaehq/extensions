import { join } from "node:path";
import {
	Action,
	ActionPanel,
	Form,
	Icon,
	showToast,
	Toast,
	useNavigation,
} from "@vicinae/api";
import { useState } from "react";
import { runAptUpdate } from "../lib/apt";
import {
	buildDeb822Source,
	SOURCES_LIST_D,
	slugify,
	writeFilePrivileged,
} from "../lib/sources";

type Props = {
	onAdded?: () => void;
};

export function AddRepoForm({ onAdded }: Props) {
	const { pop } = useNavigation();
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: Form.Values) => {
		const name = String(values.filename ?? "").trim();
		const uri = String(values.uri ?? "").trim();
		const suites = splitList(values.suites);
		const components = splitList(values.components);
		const signedBy = String(values.signedBy ?? "").trim();
		const includeSource = Boolean(values.includeSource);
		const enabled = Boolean(values.enabled);

		if (name === "" || uri === "" || suites.length === 0) {
			await showToast({
				style: Toast.Style.Failure,
				title: "URI, suites and a name are required",
			});
			return;
		}
		if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Filename must be alphanumeric with . _ -",
			});
			return;
		}

		const types = includeSource ? ["deb", "deb-src"] : ["deb"];
		const content = buildDeb822Source({
			types,
			uri,
			suites,
			components,
			signedBy: signedBy || undefined,
			comment: `Added via Vicinae apt-manager (${new Date().toISOString()})`,
		});
		const finalContent = enabled
			? content
			: content.replace("Enabled: yes", "Enabled: no");

		const path = join(SOURCES_LIST_D, `${slugify(name)}.sources`);
		setIsSubmitting(true);
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: `Adding repository ${uri}`,
		});
		const error = await writeFilePrivileged(path, finalContent);
		setIsSubmitting(false);

		if (error) {
			toast.style = Toast.Style.Failure;
			toast.title = "Failed to add repository";
			toast.message = error;
			return;
		}

		toast.style = Toast.Style.Success;
		toast.title = "Repository added";
		onAdded?.();

		const shouldUpdate = Boolean(values.updateNow);
		if (shouldUpdate) {
			await runAptUpdate();
			pop();
			return;
		}
		pop();
	};

	return (
		<Form
			navigationTitle="Add Repository"
			isLoading={isSubmitting}
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title="Add Repository"
						icon={Icon.Plus}
						onSubmit={onSubmit}
					/>
				</ActionPanel>
			}
		>
			<Form.TextField
				id="filename"
				title="Filename"
				placeholder="my-repo (no extension)"
				info="The basename of the new .sources file in /etc/apt/sources.list.d."
			/>
			<Form.TextField
				id="uri"
				title="Repository URL"
				placeholder="https://example.com/debian"
				info="The URIs field of the new deb822 source."
				autoFocus
			/>
			<Form.TextField
				id="suites"
				title="Suites"
				placeholder="stable, bookworm, jammy…"
				info="Comma-separated. e.g. stable."
			/>
			<Form.TextField
				id="components"
				title="Components"
				placeholder="main, contrib, non-free…"
				info="Comma-separated. Leave empty to omit."
			/>
			<Form.TextField
				id="signedBy"
				title="Signed-By (optional)"
				placeholder="/usr/share/keyrings/repo.gpg"
				info="Keyring path used by apt to verify the repository."
			/>
			<Form.Checkbox
				id="includeSource"
				label="Include deb-src entries"
				defaultValue={false}
			/>
			<Form.Checkbox id="enabled" label="Enabled" defaultValue={true} />
			<Form.Checkbox
				id="updateNow"
				label="Update package lists after adding"
				defaultValue={true}
			/>
		</Form>
	);
}

function splitList(value: Form.Value): string[] {
	const text = typeof value === "string" ? value : String(value ?? "");
	return text
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}
