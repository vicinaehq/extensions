import {
	Action,
	ActionPanel,
	Color,
	Icon,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useMemo, useState } from "react";
import { type OperationResult, runAptUpdate } from "../lib/apt";
import { askConfirm } from "../lib/confirm";
import {
	applyRepoChanges,
	loadRepos,
	type ParsedFile,
	type RepoSource,
	removeBlockFromContent,
} from "../lib/sources";
import { AddRepoForm } from "./AddRepo";

type Props = {
	onChanged?: () => void;
};

export function ReposView({ onChanged }: Props) {
	const [reloadKey, setReloadKey] = useState(0);
	const state = useMemo(() => loadRepos(), [reloadKey]);

	const refresh = () => setReloadKey((value) => value + 1);
	const changed = () => {
		refresh();
		onChanged?.();
	};

	return (
		<List
			navigationTitle="Repositories"
			searchBarPlaceholder="Search repositories..."
			isLoading={state.sources.length === 0 && !state.error}
			actions={
				<ActionPanel>
					<Action.Push
						title="Add Repository"
						icon={Icon.Plus}
						target={<AddRepoForm onAdded={changed} />}
					/>
					<Action
						title="Update Package Lists"
						icon={Icon.ArrowClockwise}
						onAction={runUpdateAndShow}
					/>
				</ActionPanel>
			}
		>
			<List.Section
				title="Repositories"
				subtitle={`${state.sources.length} total`}
			>
				{state.error ? (
					<List.EmptyView
						icon={Icon.Exclamationmark}
						title="No repositories found"
						description={state.error}
					/>
				) : (
					state.sources.map((repo) => (
						<List.Item
							key={repo.id}
							id={repo.id}
							title={formatTitle(repo)}
							subtitle={formatSubtitle(repo)}
							icon={{
								value: Icon.Globe01,
								tooltip: repo.enabled ? "Enabled" : "Disabled",
							}}
							accessories={enabledAccessory(repo)}
							actions={
								<ActionPanel title={formatTitle(repo)}>
									<Action
										title={repo.enabled ? "Disable" : "Enable"}
										icon={Icon.Power}
										onAction={() =>
											setEnabled(repo, state.files, !repo.enabled, changed)
										}
									/>
									<Action.Push
										title="Add Repository"
										icon={Icon.Plus}
										shortcut={{ key: "n", modifiers: ["cmd"] }}
										target={<AddRepoForm onAdded={changed} />}
									/>
									<Action
										title="Update Package Lists"
										icon={Icon.ArrowClockwise}
										onAction={runUpdateAndShow}
									/>
									<Action
										title={`Remove ${hostOf(repo) || "Repository"}`}
										icon={Icon.Trash}
										style={Action.Style.Destructive}
										shortcut={{ key: "backspace", modifiers: ["cmd"] }}
										onAction={() => removeRepo(repo, state.files, changed)}
									/>
									<Action.CopyToClipboard
										title="Copy Raw Block"
										content={repo.raw}
									/>
								</ActionPanel>
							}
						/>
					))
				)}
			</List.Section>
		</List>
	);
}

function enabledAccessory(repo: RepoSource): List.Item.Accessory[] {
	return [
		{
			tag: {
				color: repo.enabled ? Color.Green : Color.SecondaryText,
				value: repo.enabled ? "enabled" : "disabled",
			},
		},
	];
}

function hostOf(repo: RepoSource): string {
	const uri = repo.uris[0];
	if (!uri) return "";
	try {
		return new URL(uri).host;
	} catch {
		return uri;
	}
}

const formatTitle = (repo: RepoSource): string => {
	const host = hostOf(repo);
	const suites = repo.suites.join("/");
	return host ? `${host} · ${suites}` : suites || repo.file;
};

const formatSubtitle = (repo: RepoSource): string =>
	`${repo.format === "deb822" ? ".sources" : "one-line"} · ${repo.types.join(", ")} · ${repo.components.join(" ")} · ${repo.enabled ? "enabled" : "disabled"}`;

async function removeRepo(
	repo: RepoSource,
	files: ParsedFile[],
	changed: () => void,
) {
	const confirmed = await askConfirm(
		"Remove repository",
		`Remove repo ${hostOf(repo) || repo.file}?`,
		"Remove",
	);
	if (!confirmed) return;

	const toast = await showToast({
		style: Toast.Style.Animated,
		title: "Removing repository",
	});
	const file = files.find((entry) => entry.path === repo.file);
	const content = file
		? removeBlockFromContent(file.content, repo.startLine, repo.endLine)
		: null;
	const results = await applyRepoChanges([{ path: repo.file, content }]);

	const failure = results.find((result) => !result.ok);
	if (failure) {
		toast.style = Toast.Style.Failure;
		toast.title = "Failed to remove repository";
		toast.message = failure.error ?? undefined;
		return;
	}
	toast.style = Toast.Style.Success;
	toast.title = "Repository removed";
	changed();
}

/**
 * Rewrite a source file toggling the enabled status of the given repo block.
 */
function rewriteEnabled(
	base: string,
	repo: RepoSource,
	enabled: boolean,
): string {
	const lines = base.split("\n");
	if (repo.format === "deb822") {
		const commented = (lines[repo.startLine] ?? "").trimStart().startsWith("#");
		if (commented && enabled) {
			for (
				let index = repo.startLine;
				index < Math.min(repo.endLine, lines.length);
				index += 1
			) {
				lines[index] = lines[index].replace(/^#+\s*/, "");
			}
		}
		for (
			let index = repo.startLine;
			index < Math.min(repo.endLine, lines.length);
			index += 1
		) {
			const stripped = lines[index].trim();
			if (stripped.startsWith("Enabled:")) {
				lines[index] = `Enabled: ${enabled ? "yes" : "no"}`;
				return lines.join("\n");
			}
		}
		if (!enabled) {
			lines.splice(repo.endLine, 0, "Enabled: no");
		}
		return lines.join("\n");
	}
	if (repo.startLine >= 0 && repo.startLine < lines.length) {
		const line = lines[repo.startLine];
		if (enabled) {
			lines[repo.startLine] = line.replace(/^#+\s*/, "");
		} else if (!line.trimStart().startsWith("#")) {
			lines[repo.startLine] = `# ${line}`;
		}
	}
	return lines.join("\n");
}

async function setEnabled(
	repo: RepoSource,
	files: ParsedFile[],
	enabled: boolean,
	changed: () => void,
) {
	const file = files.find((entry) => entry.path === repo.file);
	const base = file?.content ?? repo.raw;
	const content = rewriteEnabled(base, repo, enabled);
	const results = await applyRepoChanges([{ path: repo.file, content }]);
	const failure = results.find((result) => !result.ok);
	if (failure) {
		await showToast({
			style: Toast.Style.Failure,
			title: `Failed to ${enabled ? "enable" : "disable"} repository`,
			message: failure.error ?? undefined,
		});
		return;
	}
	await showToast({
		style: Toast.Style.Success,
		title: `Repository ${enabled ? "enabled" : "disabled"}`,
	});
	changed();
}

async function runUpdateAndShow(): Promise<void> {
	const toast = await showToast({
		style: Toast.Style.Animated,
		title: "Refreshing package lists",
	});
	const result: OperationResult = await runAptUpdate();
	if (result.ok) {
		toast.style = Toast.Style.Success;
		toast.title = "Package lists updated";
		return;
	}
	toast.style = Toast.Style.Failure;
	toast.title = "Failed to update package lists";
	toast.message = result.stderr.trim().slice(0, 140) || undefined;
}
