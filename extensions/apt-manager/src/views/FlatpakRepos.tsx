import {
	Action,
	ActionPanel,
	Color,
	Icon,
	List,
	Keyboard,
	Toast,
	showToast,
	useNavigation,
} from "@vicinae/api";
import { useEffect, type ReactNode, useState } from "react";
import { RunResult } from "../components/RunResult";
import { askConfirm } from "../lib/confirm";
import {
	fetchFlatpakRemotes,
	flatpakRemoteDeleteArgs,
	flatpakRemoteModifyArgs,
	runFlatpakCommand,
	type FlatpakRemote,
} from "../lib/flatpakRemotes";
import { AddFlatpakRemoteForm } from "./AddFlatpakRemote";

export function FlatpakReposView() {
	const [reloadKey, setReloadKey] = useState(0);
	const [remotes, setRemotes] = useState<FlatpakRemote[] | undefined>(
		undefined,
	);
	const [error, setError] = useState<string | null>(null);
	const { push } = useNavigation();

	useEffect(() => {
		let cancelled = false;
		fetchFlatpakRemotes().then((result) => {
			if (cancelled) return;
			setRemotes(result.remotes);
			setError(result.error);
		});
		return () => {
			cancelled = true;
		};
	}, [reloadKey]);

	const refresh = () => setReloadKey((value) => value + 1);

	const systemItems = remotes?.filter(
		(remote) => remote.installation === "system",
	);
	const userItems = remotes?.filter((remote) => remote.installation === "user");

	return (
		<List
			navigationTitle="Flatpak Repositories"
			searchBarPlaceholder="Search repositories..."
			isLoading={remotes === undefined}
			actions={
				<ActionPanel>
					<Action.Push
						title="Add Remote"
						icon={Icon.Plus}
						target={<AddFlatpakRemoteForm onAdded={refresh} />}
					/>
				</ActionPanel>
			}
		>
			{error ? (
				<List.EmptyView
					icon={Icon.Exclamationmark}
					title="Failed to load remotes"
					description={error}
				/>
			) : (
				<>
					<List.Section
						title="System installation"
						subtitle={systemItems ? `${systemItems.length} total` : undefined}
					>
						<RemoteItems items={systemItems} push={push} onChanged={refresh} />
					</List.Section>
					<List.Section
						title="User installation"
						subtitle={userItems ? `${userItems.length} total` : undefined}
					>
						<RemoteItems items={userItems} push={push} onChanged={refresh} />
					</List.Section>
				</>
			)}
		</List>
	);
}

function RemoteItems({
	items,
	push,
	onChanged,
}: {
	items?: FlatpakRemote[];
	push: (element: ReactNode) => void;
	onChanged: () => void;
}) {
	if (!items) {
		return <List.Item title="Loading…" icon={Icon.CircleProgress} />;
	}
	if (items.length === 0) {
		return (
			<List.EmptyView
				icon={Icon.AppWindow}
				title="No remotes"
				description="No Flatpak remotes configured here."
			/>
		);
	}
	return items.map((remote) => (
		<List.Item
			key={`${remote.installation}/${remote.name}`}
			id={`${remote.installation}/${remote.name}`}
			title={remote.title ?? remote.name}
			subtitle={formatSubtitle(remote)}
			icon={{
				value: Icon.AppWindow,
				tooltip: remote.enabled ? "Enabled" : "Disabled",
			}}
			accessories={[
				{
					tag: {
						color: remote.enabled ? Color.Green : Color.SecondaryText,
						value: remote.enabled ? "enabled" : "disabled",
					},
				},
			]}
			actions={
				<ActionPanel title={remote.title ?? remote.name}>
					<Action
						title={remote.enabled ? "Disable" : "Enable"}
						icon={Icon.Power}
						onAction={() =>
							runRemoteAction(
								remote,
								flatpakRemoteModifyArgs(remote, !remote.enabled),
								`${remote.enabled ? "Disable" : "Enable"} ${remote.name}`,
								push,
								onChanged,
							)
						}
					/>
					<Action.Push
						title="Add Remote"
						icon={Icon.Plus}
						shortcut={{ key: "n", modifiers: ["cmd"] }}
						target={<AddFlatpakRemoteForm onAdded={onChanged} />}
					/>
					<Action.CopyToClipboard
						title="Copy Repository URL"
						content={remote.url}
						icon={Icon.CopyClipboard}
						shortcut={Keyboard.Shortcut.Common.Copy}
					/>
					<Action
						title={`Remove ${remote.name}`}
						icon={Icon.Trash}
						style={Action.Style.Destructive}
						shortcut={{ key: "backspace", modifiers: ["cmd"] }}
						onAction={() =>
							runRemoteAction(
								remote,
								flatpakRemoteDeleteArgs(remote),
								`Remove ${remote.name}`,
								push,
								onChanged,
								{
									title: "Remove repository",
									message: `Remove ${remote.name} from the ${remote.installation} installation?`,
								},
							)
						}
					/>
				</ActionPanel>
			}
		/>
	));
}

function formatSubtitle(remote: FlatpakRemote): string {
	const parts = [
		remote.url,
		remote.installation === "system" ? "system" : "user",
		`priority ${remote.priority}`,
	];
	if (remote.homepage) parts.push(remote.homepage);
	return parts.join(" · ");
}

async function runRemoteAction(
	remote: FlatpakRemote,
	args: string[],
	label: string,
	push: (element: ReactNode) => void,
	onChanged: () => void,
	confirm?: { title: string; message: string },
) {
	if (confirm) {
		const confirmed = await askConfirm(
			confirm.title,
			confirm.message,
			"Continue",
		);
		if (!confirmed) return;
	}
	const toast = await showToast({ style: Toast.Style.Animated, title: label });
	const result = await runFlatpakCommand(remote.installation, args, label);
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
			sudoArgs={remote.installation === "system" ? args : undefined}
			sudoCommand="flatpak"
		/>,
	);
	onChanged();
}
