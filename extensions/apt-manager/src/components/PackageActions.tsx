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
import {
	flatpakInstallationFlag,
	runFlatpakCommand,
} from "../lib/flatpakRemotes";
import { runPrivilegedApGet, runPrivilegedCommand } from "../lib/apt";
import { removeAppImage } from "../lib/appimage";
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
								[
									"uninstall",
									flatpakInstallationFlag(pkg.installation ?? "system"),
									"-y",
									pkg.name,
								],
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
								[
									"install",
									flatpakInstallationFlag(pkg.installation ?? "system"),
									"-y",
									"flathub",
									pkg.name,
								],
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

	if (pkg.manager === "appimage") {
		return (
			<ActionPanel title={pkg.name}>
				{toggleDetail}
				<Action
					title={`Remove ${pkg.name}`}
					icon={Icon.Trash}
					style={Action.Style.Destructive}
					shortcut={Keyboard.Shortcut.Common.Remove}
					onAction={async () => {
						const toast = await showToast({
							style: Toast.Style.Animated,
							title: `Removing ${pkg.name}`,
						});
						const appImageId = pkg.fileName ?? pkg.name;
						const result = await removeAppImage(appImageId, "desktop");
						if (result.ok) {
							toast.style = Toast.Style.Success;
							toast.title = `${pkg.name} removed`;
							toast.message = "Application and desktop entry removed";
						} else {
							toast.style = Toast.Style.Failure;
							toast.title = `Failed to remove ${pkg.name}`;
							toast.message = result.error ?? undefined;
						}
						onRefresh();
					}}
				/>
				{copyName}
			</ActionPanel>
		);
	}

	if (kind === "installed" && pkg.manager === "apt") {
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

	if (kind === "upgradable" && pkg.manager === "apt") {
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
