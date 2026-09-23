import {
	Action,
	ActionPanel,
	Icon,
	Keyboard,
	Toast,
	showToast,
	useNavigation,
} from "@vicinae/api";
import type { AptPackage, PackageListKind } from "../lib/apt";
import { runFlatpakCommand } from "../lib/flatpakRemotes";
import { runPrivilegedApGet, runPrivilegedCommand } from "../lib/apt";
import { checkAppImageUpdate, removeAppImage } from "../lib/appimage";
import type { FlatpakInstallation } from "../lib/flatpakRemotes";
import { askConfirm } from "../lib/confirm";
import { RunResult } from "./RunResult";

type ActionsProps = {
	kind: PackageListKind;
	pkg: AptPackage;
	onRefresh: () => void;
	onToggleDetail: () => void;
};

export function PackageActions({
	kind,
	pkg,
	onRefresh,
	onToggleDetail,
}: ActionsProps) {
	const { push } = useNavigation();

	const runPrivileged = async (
		command: string,
		args: string[],
		label: string,
		confirmMessage: string | null,
		installation?: FlatpakInstallation,
	) => {
		if (confirmMessage) {
			const confirmed = await askConfirm(label, confirmMessage);
			if (!confirmed) return;
		}
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: label,
		});
		const run =
			command === "apt-get"
				? () => runPrivilegedApGet(args, label)
				: command === "flatpak"
					? () => runFlatpakCommand(installation ?? "system", args, label)
					: () => runPrivilegedCommand(command, args, label);
		const result = await run();
		if (result.ok) {
			toast.style = Toast.Style.Success;
			toast.title = label;
			toast.message = "Done";
		} else {
			toast.style = Toast.Style.Failure;
			toast.title = `${label} failed`;
			toast.message =
				result.stderr.trim().slice(0, 140) ||
				`exit code ${result.code ?? "unknown"}`;
		}
		push(
			<RunResult
				heading={label}
				title={label}
				result={result}
				sudoArgs={
					command === "flatpak" && installation === "system"
						? args
						: command === "apt-get"
							? args
							: undefined
				}
				sudoCommand={command}
			/>,
		);
		onRefresh();
	};

	const toggleDetail = (
		<Action
			title="Toggle Detail"
			icon={Icon.AppWindowSidebarLeft}
			shortcut={{ modifiers: ["cmd"], key: "d" }}
			onAction={onToggleDetail}
		/>
	);

	const copyName = (
		<Action.CopyToClipboard
			title="Copy Package Name"
			content={pkg.name}
			icon={Icon.CopyClipboard}
			shortcut={Keyboard.Shortcut.Common.Copy}
		/>
	);

	if (pkg.manager === "flatpak") {
		return (
			<ActionPanel title={pkg.name}>
				{toggleDetail}
				{pkg.flags.installed ? (
					<Action
						title={`Remove ${pkg.name}`}
						icon={Icon.Trash}
						style={Action.Style.Destructive}
						shortcut={Keyboard.Shortcut.Common.Remove}
						onAction={() =>
							runPrivileged(
								"flatpak",
								["uninstall", "-y", pkg.name],
								`Remove ${pkg.name}`,
								`Remove the Flatpak application ${pkg.name}?`,
								pkg.installation,
							)
						}
					/>
				) : (
					<Action
						title={`Install ${pkg.name}`}
						icon={Icon.Plus}
						onAction={() =>
							runPrivileged(
								"flatpak",
								["install", "-y", "flathub", pkg.name],
								`Install ${pkg.name}`,
								null,
								pkg.installation,
							)
						}
					/>
				)}
				{copyName}
			</ActionPanel>
		);
	}

	if (kind === "installed") {
		return (
			<ActionPanel title={pkg.name}>
				{toggleDetail}
				<Action
					title={`Remove ${pkg.name}`}
					icon={Icon.Trash}
					style={Action.Style.Destructive}
					shortcut={Keyboard.Shortcut.Common.Remove}
					onAction={() =>
						runPrivileged(
							"apt-get",
							["remove", "-y", pkg.name],
							`Remove ${pkg.name}`,
							`Remove ${pkg.name}? Its configuration files are kept.`,
						)
					}
				/>
				<Action
					title={`Reinstall ${pkg.name}`}
					icon={Icon.ArrowClockwise}
					onAction={() =>
						runPrivileged(
							"apt-get",
							["install", "--reinstall", "-y", pkg.name],
							`Reinstall ${pkg.name}`,
							null,
						)
					}
				/>
				{copyName}
			</ActionPanel>
		);
	}

	if (kind === "upgradable") {
		return (
			<ActionPanel title={pkg.name}>
				{toggleDetail}
				<Action
					title={`Upgrade ${pkg.name}`}
					icon={Icon.Bolt}
					onAction={() =>
						runPrivileged(
							"apt-get",
							["install", "--only-upgrade", "-y", pkg.name],
							`Upgrade ${pkg.name}`,
							`Upgrade ${pkg.name} to ${pkg.version}?`,
						)
					}
				/>
				{copyName}
			</ActionPanel>
		);
	}

	if (pkg.manager === "appimage") {
		return (
			<ActionPanel title={pkg.name}>
				{toggleDetail}
				<Action
					title={`Remove ${pkg.name} (file only)`}
					icon={Icon.Trash}
					style={Action.Style.Destructive}
					onAction={async () => {
						const toast = await showToast({
							style: Toast.Style.Animated,
							title: `Removing ${pkg.name}`,
						});
						const result = await removeAppImage(pkg.name, "file");
						if (result.ok) {
							toast.style = Toast.Style.Success;
							toast.title = `${pkg.name} removed`;
							toast.message = "File removed";
						} else {
							toast.style = Toast.Style.Failure;
							toast.title = `Failed to remove ${pkg.name}`;
							toast.message = result.error ?? undefined;
						}
						onRefresh();
					}}
				/>
				<Action
					title={`Remove ${pkg.name} (with desktop entries)`}
					icon={Icon.Trash}
					style={Action.Style.Destructive}
					onAction={async () => {
						const toast = await showToast({
							style: Toast.Style.Animated,
							title: `Removing ${pkg.name}`,
						});
						const result = await removeAppImage(pkg.name, "desktop");
						if (result.ok) {
							toast.style = Toast.Style.Success;
							toast.title = `${pkg.name} removed`;
							toast.message = "File and desktop entry removed";
						} else {
							toast.style = Toast.Style.Failure;
							toast.title = `Failed to remove ${pkg.name}`;
							toast.message = result.error ?? undefined;
						}
						onRefresh();
					}}
				/>
				<Action
					title={`Remove ${pkg.name} (with config)`}
					icon={Icon.Trash}
					style={Action.Style.Destructive}
					onAction={async () => {
						const toast = await showToast({
							style: Toast.Style.Animated,
							title: `Removing ${pkg.name}`,
						});
						const result = await removeAppImage(pkg.name, "config");
						if (result.ok) {
							toast.style = Toast.Style.Success;
							toast.title = `${pkg.name} removed`;
							toast.message = "File, desktop entry, and config removed";
						} else {
							toast.style = Toast.Style.Failure;
							toast.title = `Failed to remove ${pkg.name}`;
							toast.message = result.error ?? undefined;
						}
						onRefresh();
					}}
				/>
				<Action
					title="Check for Updates"
					icon={Icon.ArrowClockwise}
					onAction={async () => {
						const toast = await showToast({
							style: Toast.Style.Animated,
							title: `Checking for updates`,
						});
						const result = await checkAppImageUpdate(pkg.name);
						if (!result.ok) {
							toast.style = Toast.Style.Failure;
							toast.title = `Failed to check for updates`;
							toast.message = result.error ?? undefined;
						} else if (result.updateAvailable) {
							toast.style = Toast.Style.Success;
							toast.title = `Update available for ${pkg.name}`;
						} else {
							toast.style = Toast.Style.Success;
							toast.title = `${pkg.name} is up to date`;
						}
					}}
				/>
				{copyName}
			</ActionPanel>
		);
	}

	return (
		<ActionPanel title={pkg.name}>
			{toggleDetail}
			<Action
				title={`Install ${pkg.name}`}
				icon={Icon.Plus}
				onAction={() =>
					runPrivileged(
						"apt-get",
						["install", "-y", pkg.name],
						`Install ${pkg.name}`,
						null,
					)
				}
			/>
			{pkg.flags.installed ? (
				<Action
					title={`Remove ${pkg.name}`}
					icon={Icon.Trash}
					style={Action.Style.Destructive}
					shortcut={Keyboard.Shortcut.Common.Remove}
					onAction={() =>
						runPrivileged(
							"apt-get",
							["remove", "-y", pkg.name],
							`Remove ${pkg.name}`,
							`Remove ${pkg.name}? Its configuration files are kept.`,
						)
					}
				/>
			) : null}
			{pkg.flags.upgradable ? (
				<Action
					title={`Upgrade ${pkg.name}`}
					icon={Icon.Bolt}
					onAction={() =>
						runPrivileged(
							"apt-get",
							["install", "--only-upgrade", "-y", pkg.name],
							`Upgrade ${pkg.name}`,
							`Upgrade ${pkg.name} to ${pkg.version}?`,
						)
					}
				/>
			) : null}
			{copyName}
		</ActionPanel>
	);
}
