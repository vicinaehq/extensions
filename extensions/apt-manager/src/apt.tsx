import {
	Action,
	ActionPanel,
	Icon,
	type Keyboard,
	List,
	showToast,
	Toast,
	useNavigation,
} from "@vicinae/api";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { PackageView } from "./components/PackageView";
import { RunResult } from "./components/RunResult";
import {
	type OperationResult,
	runAptCleanup,
	runAptUpgradeAll,
} from "./lib/apt";
import { askConfirm } from "./lib/confirm";
import { fetchFlatpakRemotes, hasFlatpakBinary } from "./lib/flatpakRemotes";
import { loadRepos } from "./lib/sources";
import { ReposView } from "./views/Repos";
import { FlatpakReposView } from "./views/FlatpakRepos";

export default function Command() {
	const repoCount = useMemo(() => loadRepos().sources.length, []);
	const flatpakAvailable = useMemo(() => hasFlatpakBinary(), []);
	const [flatpakRepoCount, setFlatpakRepoCount] = useState<number | null>(null);
	const runAndShow = usePrivilegedRunner();

	useEffect(() => {
		if (!flatpakAvailable) return;
		let cancelled = false;
		fetchFlatpakRemotes().then((result) => {
			if (!cancelled) setFlatpakRepoCount(result.remotes.length);
		});
		return () => {
			cancelled = true;
		};
	}, [flatpakAvailable]);

	return (
		<List
			navigationTitle="Apt Manager"
			searchBarPlaceholder="Search commands..."
		>
			<List.Section title="Packages">
				<RootItem
					title="Installed packages"
					subtitle="Packages currently installed"
					icon={Icon.CheckCircle}
					shortcut={{ key: "1", modifiers: ["cmd"] } as Keyboard.Shortcut}
					actions={
						<Action.Push
							title="List Installed"
							target={
								<PackageView
									kind="installed"
									title="Installed"
									emptyTitle="No installed packages"
								/>
							}
						/>
					}
				/>
				<RootItem
					title="All packages"
					subtitle="Everything known to the apt cache"
					icon={Icon.Box}
					shortcut={{ key: "2", modifiers: ["cmd"] } as Keyboard.Shortcut}
					actions={
						<Action.Push
							title="List All"
							target={
								<PackageView
									kind="all"
									title="All Packages"
									emptyTitle="No packages found"
								/>
							}
						/>
					}
				/>
				<RootItem
					title="Upgradable packages"
					subtitle="Packages with a newer version available"
					icon={Icon.ArrowClockwise}
					shortcut={{ key: "3", modifiers: ["cmd"] } as Keyboard.Shortcut}
					actions={
						<Action.Push
							title="List Upgradable"
							target={
								<PackageView
									kind="upgradable"
									title="Upgradable"
									emptyTitle="All packages are up to date"
								/>
							}
						/>
					}
				/>
			</List.Section>
			<List.Section title="System">
				<RootItem
					title="Update all packages"
					subtitle="apt update then upgrade with new packages"
					icon={Icon.Bolt}
					shortcut={{ key: "u", modifiers: ["cmd"] } as Keyboard.Shortcut}
					onAction={() =>
						runAndShow(
							runAptUpgradeAll,
							"Update all packages",
							["upgrade", "-y", "--with-new-pkgs"],
							"Run apt update then upgrade all packages?",
						)
					}
					extraActions={
						<Action.RunInTerminal
							title="Retry in Terminal (sudo)"
							icon={Icon.Terminal}
							args={["sudo", "apt-get", "upgrade", "-y", "--with-new-pkgs"]}
							options={{ hold: true }}
						/>
					}
				/>
				<RootItem
					title="Clean up system"
					subtitle="autoremove --purge then autoclean"
					icon={Icon.Eraser}
					shortcut={{ key: "k", modifiers: ["cmd"] } as Keyboard.Shortcut}
					destructive
					onAction={() =>
						runAndShow(
							runAptCleanup,
							"Clean up system",
							["autoremove", "-y", "--purge"],
							"Run autoremove --purge and autoclean?",
						)
					}
				/>
			</List.Section>
			<List.Section title="Repositories">
				<RootItem
					title="Repositories"
					subtitle={`${repoCount} configured source(s)`}
					icon={Icon.Globe01}
					shortcut={{ key: "r", modifiers: ["cmd"] } as Keyboard.Shortcut}
					actions={
						<Action.Push title="Manage Repositories" target={<ReposView />} />
					}
				/>
				{flatpakAvailable && (
					<RootItem
						title="Flatpak repositories"
						subtitle={
							flatpakRepoCount === null
								? "Scanning…"
								: `${flatpakRepoCount} configured remote(s)`
						}
						icon={Icon.AppWindow}
						shortcut={{ key: "f", modifiers: ["cmd"] } as Keyboard.Shortcut}
						actions={
							<Action.Push
								title="Manage Flatpak Repositories"
								target={<FlatpakReposView />}
							/>
						}
					/>
				)}
			</List.Section>
		</List>
	);
}

type RootItemProps = {
	title: string;
	subtitle?: string;
	icon: Icon;
	shortcut: Keyboard.Shortcut;
	actions?: ReactNode;
	extraActions?: ReactNode;
	destructive?: boolean;
	onAction?: () => void;
};

function RootItem({
	title,
	subtitle,
	icon,
	shortcut,
	actions,
	extraActions,
	destructive,
	onAction,
}: RootItemProps) {
	return (
		<List.Item
			title={title}
			subtitle={subtitle}
			icon={icon}
			actions={
				<ActionPanel title={title}>
					{actions ??
						(onAction ? (
							<Action
								title="Run"
								icon={Icon.Play}
								style={
									destructive ? Action.Style.Destructive : Action.Style.Regular
								}
								shortcut={shortcut}
								onAction={onAction}
							/>
						) : null)}
					{extraActions}
				</ActionPanel>
			}
		/>
	);
}

function usePrivilegedRunner() {
	const { push } = useNavigation();
	return async (
		run: () => Promise<OperationResult>,
		heading: string,
		sudoArgs: string[],
		confirmMessage: string | null,
	) => {
		if (confirmMessage) {
			const confirmed = await askConfirm(heading, confirmMessage);
			if (!confirmed) return;
		}
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: heading,
		});
		const result = await run();
		if (result.ok) {
			toast.style = Toast.Style.Success;
			toast.title = `${heading} completed`;
		} else {
			toast.style = Toast.Style.Failure;
			toast.title = `${heading} failed`;
			toast.message =
				result.stderr.trim().slice(0, 140) ||
				`exit code ${result.code ?? "unknown"}`;
		}
		push(
			<RunResult
				heading={heading}
				title={heading}
				result={result}
				sudoArgs={sudoArgs}
			/>,
		);
	};
}
