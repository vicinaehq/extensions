import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync, rmSync } from "node:fs";
import { useState } from "react";
import {
	Action,
	ActionPanel,
	Form,
	Icon,
	List,
	Toast,
	launchCommand,
	LaunchType,
	showToast,
	useNavigation,
} from "@vicinae/api";
import {
	decryptRaycastFile,
	findNodeExtensions,
	type RaycastNodeExtension,
} from "./lib/raycast";

interface ExtensionPick {
	name: string;
	author: string;
}

// ---- Installer handoff ----
// Same headless pattern as the clipboard import: the LIST worker must not be the
// one doing the long downloads (a view-command worker dies with its CommandFrame
// on window dismissal / popToRoot). We write the picked extensions to a 0600 temp
// JSON and hand the PATH to the no-view `install-extensions` command via
// launchContext (in-memory). The passphrase never leaves this worker, and it is
// intentionally NOT included in the handoff payload.
async function handOffToInstaller(picks: ExtensionPick[]): Promise<void> {
	const at = Math.floor(Date.now() / 1000);
	const tmpClip = join(tmpdir(), `raycast-import-ext-${at}.json`);
	writeFileSync(tmpClip, JSON.stringify(picks), { mode: 0o600 });
	try {
		await launchCommand({
			name: "install-extensions",
			type: LaunchType.UserInitiated,
			context: { file: tmpClip },
		});
	} catch (err) {
		rmSync(tmpClip, { force: true });
		await showToast({
			style: Toast.Style.Failure,
			title: "Background installer unavailable",
			message: err instanceof Error ? err.message : String(err),
		});
		throw err;
	}
}

// ---- Selection list ----
function ExtensionPicker({
	extensions,
	onBack,
}: {
	extensions: RaycastNodeExtension[];
	onBack: () => void;
}) {
	const [selected, setSelected] = useState<Set<string>>(
		() => new Set(extensions.map((e) => e.name)),
	);
	const total = extensions.length;
	const count = selected.size;

	const toggle = (name: string) =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(name)) next.delete(name);
			else next.add(name);
			return next;
		});

	const selectAll = () => setSelected(new Set(extensions.map((e) => e.name)));
	const selectNone = () => setSelected(new Set());
	const invert = () =>
		setSelected(new Set(extensions.map((e) => e.name).filter((n) => !selected.has(n))));

	const install = async () => {
		const picks = extensions
			.filter((e) => selected.has(e.name))
			.map((e) => ({ name: e.name, author: e.author }));
		if (picks.length === 0) {
			await showToast({ style: Toast.Style.Failure, title: "No extensions selected" });
			return;
		}
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: "Starting extension install…",
			message: `${picks.length} selected — runs in the background; closing this window is safe.`,
		});
		try {
			await handOffToInstaller(picks);
			toast.style = Toast.Style.Success;
			toast.title = "Extension install running in the background";
			toast.message = `${picks.length} selected — progress shows as toasts.`;
		} catch (err) {
			toast.style = Toast.Style.Failure;
			toast.title = "Could not start background installer";
			toast.message = err instanceof Error ? err.message : String(err);
		}
	};

	return (
		<List
			isLoading={false}
			navigationTitle={`Import Raycast Extensions (${total})`}
			searchBarPlaceholder="Filter by extension or author…"
			actions={
				<ActionPanel>
					<Action title={`Install ${count} selected`} icon={Icon.Download} onAction={install} />
					<Action title={`Select all (${total})`} icon={Icon.CheckCircle} onAction={selectAll} />
					<Action title="Select none" icon={Icon.Circle} onAction={selectNone} />
					<Action title="Invert selection" icon={Icon.Switch} onAction={invert} />
					<Action title="Back" icon={Icon.ArrowLeft} onAction={onBack} />
				</ActionPanel>
			}
		>
			<List.Section title="Raycast extensions" subtitle={`${count} of ${total} selected`}>
				{extensions.map((e) => {
					const isSel = selected.has(e.name);
					return (
						<List.Item
							key={e.uuid || e.name}
							title={e.name}
							subtitle={e.author}
							icon={isSel ? Icon.CheckCircle : Icon.Circle}
							accessories={[{ icon: isSel ? Icon.Checkmark : undefined, tooltip: isSel ? "Selected" : null }]}
							actions={
								<ActionPanel>
									<Action
										title={isSel ? "Deselect" : "Select"}
										icon={isSel ? Icon.Circle : Icon.CheckCircle}
										onAction={() => toggle(e.name)}
									/>
									<Action title="Select all" icon={Icon.CheckCircle} onAction={selectAll} />
									<Action title="Select none" icon={Icon.Circle} onAction={selectNone} />
									<Action title="Install selected" icon={Icon.Download} onAction={install} />
								</ActionPanel>
							}
						/>
					);
				})}
			</List.Section>
		</List>
	);
}

// ---- Form ----
function ImportExtensionsForm() {
	const { push, pop } = useNavigation();
	const [submitting, setSubmitting] = useState(false);

	async function onSubmit(input: Form.Values) {
		const file = Array.isArray(input.raycastFile)
			? input.raycastFile[0]
			: (input.raycastFile as string | undefined);
		const passphrase = String(input.passphrase ?? "");

		if (!file) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Pick a file",
				message:
					"Select a .rayconfig backup from Raycast 'Export Settings & Data' — we'll decrypt it locally.",
			});
			return;
		}

		setSubmitting(true);
		try {
			const root = decryptRaycastFile(file, passphrase);
			const extensions = findNodeExtensions(root);
			if (extensions.length === 0) {
				await showToast({
					style: Toast.Style.Failure,
					title: "No extensions in this export",
					message:
						"nodeExtensions was empty — make sure this is the full 'Export Settings & Data' .rayconfig backup.",
				});
				return;
			}
			push(
				<ExtensionPicker
					extensions={extensions}
					onBack={() => pop()}
				/>,
			);
		} catch (err) {
			const code = err instanceof Error ? err.message : "corrupt";
			const title =
				code === "notRaycast"
					? "Not a Raycast export"
					: code === "passphrase"
						? "Incorrect passphrase"
						: code === "invalid-json"
							? "Invalid JSON"
							: code === "corrupt"
								? "Corrupt export"
								: `Unexpected (${code})`;
			await showToast({ style: Toast.Style.Failure, title, message: `${file} — ${code}` });
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Form
			navigationTitle="Import Raycast Extensions"
			actions={
				<ActionPanel>
					<Action.SubmitForm title="Next" onSubmit={onSubmit} />
				</ActionPanel>
			}
		>
			<Form.Description
				text={
					"Pick a Raycast '.rayconfig' backup ('Export Settings & Data'). We decrypt it locally with your passphrase, then you pick which of your installed Raycast extensions to install into Vicinae — each is downloaded from the official Raycast extension store (native compatibility) and installed exactly like Vicinae's own store install."
				}
			/>
			<Form.FilePicker
				id="raycastFile"
				title="Raycast .rayconfig"
				info="A full .rayconfig backup (contains nodeExtensions)."
				canChooseFiles={true}
				canChooseDirectories={false}
				allowMultipleSelection={false}
				storeValue={true}
			/>
			<Form.PasswordField
				id="passphrase"
				title="Export passphrase"
				placeholder="The passphrase you set in Raycast for the backup"
				info="Only needed for encrypted .rayconfig backups."
				storeValue={true}
			/>
			<Form.Description
				text={
					"Installs run as a background command — closing the window won't interrupt them. Already-installed extensions are skipped automatically."
				}
			/>
		</Form>
	);
}

export default function Command(): JSX.Element {
	return <ImportExtensionsForm />;
}
