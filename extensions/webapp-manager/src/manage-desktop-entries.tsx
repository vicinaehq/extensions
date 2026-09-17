import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
	Action,
	ActionPanel,
	Alert,
	Clipboard,
	confirmAlert,
	environment,
	Form,
	getPreferenceValues,
	Icon,
	List,
	showToast,
	Toast,
	useNavigation,
} from "@vicinae/api";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	DEFAULT_BROWSER_ARGS_TEMPLATE,
	DEFAULT_BROWSER_COMMAND,
	DEFAULT_DESKTOP_DIRECTORY,
	DEFAULT_WINDOW_MANAGER,
	DEFAULT_WINDOW_MATCH_MODE,
	deleteManagedEntry,
	type EntryDraft,
	hostnameFromUrl,
	launchScriptPathForEntry,
	listManagedEntries,
	parseWindowManager,
	parseWindowMatchMode,
	resolvePath,
	saveManagedEntry,
	type ManagedDesktopEntry,
	type WindowManager,
} from "./lib/desktop-entry-manager";

type ExtensionPreferences = {
	desktopEntryDirectory?: string;
	browserCommand?: string;
	browserArgsTemplate?: string;
	windowManager?: WindowManager | string;
	customWindowFocusCommand?: string;
};

type EntryFormProps = {
	mode: "create" | "edit";
	entry?: ManagedDesktopEntry;
	defaultUrl?: string;
	defaultBrowserCommand: string;
	defaultBrowserArgsTemplate: string;
	onSubmitEntry: (
		draft: EntryDraft,
		existing?: ManagedDesktopEntry,
	) => Promise<void>;
};

type ImportConfigFormProps = {
	entries: ManagedDesktopEntry[];
	defaultBrowserCommand: string;
	defaultBrowserArgsTemplate: string;
	onImportEntries: (entries: WebappConfigEntry[]) => Promise<void>;
};

type WebappConfigEntry = {
	id?: string;
	name: string;
	url: string;
	comment?: string;
	shortcut?: string;
	browserCommand: string;
	browserArgsTemplate: string;
	singleWindow: boolean;
	windowMatchMode: string;
};

type WebappConfigExport = {
	schema: "vicinae-webapp-config";
	version: 1;
	exportedAt: string;
	entries: WebappConfigEntry[];
};

type ShortcutInstallTarget = {
	windowManager: WindowManager;
	mainConfigPath: string;
	shortcutConfigPath: string;
	includeLine: string;
	reloadCommand?: string[];
};

type GlobalShortcut = {
	modifiers: string[];
	key: string;
	normalized: string;
};

type InstallGlobalShortcutConfigOptions = {
	entries: ManagedDesktopEntry[];
	directory: string;
	iconDirectory: string;
	launcherDirectory: string;
	stateDirectory: string;
	windowManager: WindowManager;
	customFocusCommandTemplate?: string;
};

export default function ManageDesktopEntries() {
	const preferences = getPreferenceValues<ExtensionPreferences>();
	const desktopEntryDirectory = resolvePath(
		preferences.desktopEntryDirectory || DEFAULT_DESKTOP_DIRECTORY,
	);
	const defaultBrowserCommand =
		preferences.browserCommand?.trim() || DEFAULT_BROWSER_COMMAND;
	const defaultBrowserArgsTemplate =
		preferences.browserArgsTemplate?.trim() || DEFAULT_BROWSER_ARGS_TEMPLATE;
	const windowManager = parseWindowManager(
		preferences.windowManager || DEFAULT_WINDOW_MANAGER,
	);
	const customWindowFocusCommand =
		preferences.customWindowFocusCommand?.trim() || undefined;

	const iconDirectory = useMemo(
		() => path.join(environment.supportPath, "desktop-entry-favicons"),
		[],
	);
	const launcherDirectory = useMemo(
		() => path.join(environment.supportPath, "desktop-entry-launchers"),
		[],
	);
	const stateDirectory = useMemo(
		() => path.join(environment.supportPath, "desktop-entry-window-state"),
		[],
	);
	const exportFilePath = useMemo(
		() => path.join(environment.supportPath, "webapp-config-export.json"),
		[],
	);

	const [entries, setEntries] = useState<ManagedDesktopEntry[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [searchText, setSearchText] = useState<string>("");

	const reloadEntries = useCallback(async () => {
		setIsLoading(true);
		try {
			setEntries(await listManagedEntries(desktopEntryDirectory));
		} catch (error) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Could not load desktop entries",
				message: getErrorMessage(error),
			});
		} finally {
			setIsLoading(false);
		}
	}, [desktopEntryDirectory]);

	useEffect(() => {
		void reloadEntries();
	}, [reloadEntries]);

	const upsertEntry = useCallback(
		async (draft: EntryDraft, existing?: ManagedDesktopEntry) => {
			const operation = existing ? "Updating" : "Creating";
			const toast = await showToast({
				style: Toast.Style.Animated,
				title: `${operation} desktop entry...`,
			});

			try {
				const savedEntry = await saveManagedEntry({
					directory: desktopEntryDirectory,
					iconDirectory,
					launcherDirectory,
					stateDirectory,
					windowManager,
					customFocusCommandTemplate: customWindowFocusCommand,
					draft,
					existingEntry: existing,
				});
				const latestEntries = await listManagedEntries(desktopEntryDirectory);
				setEntries(latestEntries);

				let shortcutError: string | undefined;
				try {
					await installGlobalShortcutConfig({
						entries: latestEntries,
						directory: desktopEntryDirectory,
						iconDirectory,
						launcherDirectory,
						stateDirectory,
						windowManager,
						customFocusCommandTemplate: customWindowFocusCommand,
					});
				} catch (error) {
					shortcutError = getErrorMessage(error);
				}

				toast.style = shortcutError ? Toast.Style.Failure : Toast.Style.Success;
				toast.title = shortcutError
					? "Desktop entry saved, shortcuts failed"
					: existing
						? "Desktop entry updated"
						: "Desktop entry created";
				toast.message = shortcutError || savedEntry.desktopFileName;
			} catch (error) {
				toast.style = Toast.Style.Failure;
				toast.title = existing
					? "Failed to update desktop entry"
					: "Failed to create desktop entry";
				toast.message = getErrorMessage(error);
				throw error;
			}
		},
		[
			customWindowFocusCommand,
			desktopEntryDirectory,
			iconDirectory,
			launcherDirectory,
			stateDirectory,
			windowManager,
		],
	);

	const handleDelete = useCallback(
		async (entry: ManagedDesktopEntry) => {
			const confirmed = await confirmAlert({
				title: `Delete \"${entry.name}\"?`,
				message: `This removes ${entry.desktopFileName}.`,
				primaryAction: {
					title: "Delete",
					style: Alert.ActionStyle.Destructive,
				},
			});
			if (!confirmed) {
				return;
			}

			const toast = await showToast({
				style: Toast.Style.Animated,
				title: "Deleting desktop entry...",
			});
			try {
				await deleteManagedEntry(
					entry,
					iconDirectory,
					launcherDirectory,
					stateDirectory,
				);
				const latestEntries = await listManagedEntries(desktopEntryDirectory);
				setEntries(latestEntries);

				let shortcutError: string | undefined;
				try {
					await installGlobalShortcutConfig({
						entries: latestEntries,
						directory: desktopEntryDirectory,
						iconDirectory,
						launcherDirectory,
						stateDirectory,
						windowManager,
						customFocusCommandTemplate: customWindowFocusCommand,
					});
				} catch (error) {
					shortcutError = getErrorMessage(error);
				}

				toast.style = shortcutError ? Toast.Style.Failure : Toast.Style.Success;
				toast.title = shortcutError
					? "Desktop entry deleted, shortcuts failed"
					: "Desktop entry deleted";
				toast.message = shortcutError || entry.desktopFileName;
			} catch (error) {
				toast.style = Toast.Style.Failure;
				toast.title = "Failed to delete desktop entry";
				toast.message = getErrorMessage(error);
			}
		},
		[
			customWindowFocusCommand,
			desktopEntryDirectory,
			iconDirectory,
			launcherDirectory,
			stateDirectory,
			windowManager,
		],
	);

	const handleRefreshFavicon = useCallback(
		async (entry: ManagedDesktopEntry) => {
			await upsertEntry(entryToDraft(entry, true), entry);
		},
		[upsertEntry],
	);

	const handleRefreshAllFavicons = useCallback(async () => {
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: "Refreshing favicons...",
			message: `${entries.length} webapps`,
		});
		let refreshed = 0;
		let failed = 0;
		let shortcutCount = 0;
		let shortcutError: string | undefined;

		try {
			for (const entry of entries) {
				try {
					await saveManagedEntry({
						directory: desktopEntryDirectory,
						iconDirectory,
						launcherDirectory,
						stateDirectory,
						windowManager,
						customFocusCommandTemplate: customWindowFocusCommand,
						draft: entryToDraft(entry, true),
						existingEntry: entry,
					});
					refreshed += 1;
				} catch {
					failed += 1;
				}
			}

			const latestEntries = await listManagedEntries(desktopEntryDirectory);
			setEntries(latestEntries);

			try {
				shortcutCount = await installGlobalShortcutConfig({
					entries: latestEntries,
					directory: desktopEntryDirectory,
					iconDirectory,
					launcherDirectory,
					stateDirectory,
					windowManager,
					customFocusCommandTemplate: customWindowFocusCommand,
				});
			} catch (error) {
				shortcutError = getErrorMessage(error);
			}

			toast.style =
				failed > 0 || shortcutError ? Toast.Style.Failure : Toast.Style.Success;
			toast.title =
				failed > 0 || shortcutError
					? "Some updates failed"
					: "Favicons and shortcuts refreshed";
			toast.message = shortcutError
				? `${refreshed} favicons refreshed, ${failed} failed. Shortcuts: ${shortcutError}`
				: `${refreshed} favicons refreshed, ${failed} failed, ${shortcutCount} shortcuts installed`;
		} catch (error) {
			toast.style = Toast.Style.Failure;
			toast.title = "Failed to refresh favicons";
			toast.message = getErrorMessage(error);
		}
	}, [
		customWindowFocusCommand,
		desktopEntryDirectory,
		entries,
		iconDirectory,
		launcherDirectory,
		stateDirectory,
		windowManager,
	]);

	const handleExportConfig = useCallback(async () => {
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: "Exporting webapp config...",
		});

		try {
			const exportJson = JSON.stringify(buildConfigExport(entries), null, 2);
			await fs.mkdir(environment.supportPath, { recursive: true });
			await fs.writeFile(exportFilePath, `${exportJson}\n`, "utf8");
			await Clipboard.copy(exportJson);
			toast.style = Toast.Style.Success;
			toast.title = "Webapp config exported";
			toast.message = `Copied JSON and wrote ${path.basename(exportFilePath)}`;
		} catch (error) {
			toast.style = Toast.Style.Failure;
			toast.title = "Failed to export webapp config";
			toast.message = getErrorMessage(error);
		}
	}, [entries, exportFilePath]);

	const handleImportEntries = useCallback(
		async (configEntries: WebappConfigEntry[]) => {
			const toast = await showToast({
				style: Toast.Style.Animated,
				title: "Importing webapp config...",
			});
			let created = 0;
			let updated = 0;

			try {
				for (const configEntry of configEntries) {
					const existing = findMatchingImportEntry(configEntry, entries);
					await saveManagedEntry({
						directory: desktopEntryDirectory,
						iconDirectory,
						launcherDirectory,
						stateDirectory,
						windowManager,
						customFocusCommandTemplate: customWindowFocusCommand,
						draft: configEntryToDraft(configEntry),
						existingEntry: existing,
					});
					if (existing) {
						updated += 1;
					} else {
						created += 1;
					}
				}

				await reloadEntries();
				toast.style = Toast.Style.Success;
				toast.title = "Webapp config imported";
				toast.message = `${created} created, ${updated} updated`;
			} catch (error) {
				toast.style = Toast.Style.Failure;
				toast.title = "Failed to import webapp config";
				toast.message = getErrorMessage(error);
				throw error;
			}
		},
		[
			customWindowFocusCommand,
			desktopEntryDirectory,
			entries,
			iconDirectory,
			launcherDirectory,
			reloadEntries,
			stateDirectory,
			windowManager,
		],
	);

	const handleInstallGlobalShortcuts = useCallback(async () => {
		const entriesWithShortcuts = entries.filter((entry) =>
			Boolean(entry.shortcut?.trim()),
		);
		if (entriesWithShortcuts.length === 0) {
			await showToast({
				style: Toast.Style.Failure,
				title: "No global shortcuts configured",
			});
			return;
		}

		const installTarget = getShortcutInstallTarget(windowManager);
		if (!installTarget) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Global shortcuts are not supported",
				message: "Choose niri, Hyprland, Sway, or i3 in preferences.",
			});
			return;
		}

		const confirmed = await confirmAlert({
			title: "Install global shortcuts?",
			message: `This writes ${installTarget.shortcutConfigPath} and updates ${installTarget.mainConfigPath} if needed.`,
			primaryAction: {
				title: "Install",
			},
		});
		if (!confirmed) {
			return;
		}

		const toast = await showToast({
			style: Toast.Style.Animated,
			title: "Installing global shortcuts...",
		});

		try {
			const shortcutCount = await installGlobalShortcutConfig({
				entries,
				directory: desktopEntryDirectory,
				iconDirectory,
				launcherDirectory,
				stateDirectory,
				windowManager,
				customFocusCommandTemplate: customWindowFocusCommand,
			});

			toast.style = Toast.Style.Success;
			toast.title = "Global shortcuts installed";
			toast.message = `${shortcutCount} shortcuts`;
		} catch (error) {
			toast.style = Toast.Style.Failure;
			toast.title = "Failed to install global shortcuts";
			toast.message = getErrorMessage(error);
		}
	}, [
		customWindowFocusCommand,
		desktopEntryDirectory,
		entries,
		iconDirectory,
		launcherDirectory,
		stateDirectory,
		windowManager,
	]);

	const createEntryTarget = useCallback(
		(defaultUrl?: string) => (
			<EntryForm
				mode="create"
				defaultUrl={defaultUrl}
				defaultBrowserCommand={defaultBrowserCommand}
				defaultBrowserArgsTemplate={defaultBrowserArgsTemplate}
				onSubmitEntry={upsertEntry}
			/>
		),
		[defaultBrowserArgsTemplate, defaultBrowserCommand, upsertEntry],
	);

	return (
		<List
			isLoading={isLoading}
			searchText={searchText}
			onSearchTextChange={setSearchText}
			searchBarPlaceholder="Search managed desktop URL entries..."
			actions={
				<ActionPanel>
					<Action.Push
						title="Create Desktop Entry"
						icon={Icon.Plus}
						shortcut={{ key: "enter", modifiers: ["shift"] }}
						target={createEntryTarget(guessUrlFromSearch(searchText))}
					/>
					<Action
						title="Export Webapp Config"
						icon={Icon.Download}
						onAction={() => void handleExportConfig()}
					/>
					<Action
						title="Install Global Shortcuts"
						icon={Icon.Keyboard}
						onAction={() => void handleInstallGlobalShortcuts()}
					/>
					<Action
						title="Refresh All Favicons"
						icon={Icon.ArrowClockwise}
						onAction={() => void handleRefreshAllFavicons()}
					/>
					<Action.Push
						title="Import Webapp Config"
						icon={Icon.Upload}
						target={
							<ImportConfigForm
								entries={entries}
								defaultBrowserCommand={defaultBrowserCommand}
								defaultBrowserArgsTemplate={defaultBrowserArgsTemplate}
								onImportEntries={handleImportEntries}
							/>
						}
					/>
				</ActionPanel>
			}
		>
			{entries.length === 0 ? (
				<List.EmptyView
					title="No managed desktop entries"
					description={`Entries will be saved to ${desktopEntryDirectory}`}
					actions={
						<ActionPanel>
							<Action.Push
								title="Create Desktop Entry"
								icon={Icon.Plus}
								shortcut={{ key: "enter", modifiers: ["shift"] }}
								target={createEntryTarget(guessUrlFromSearch(searchText))}
							/>
							<Action.Push
								title="Import Webapp Config"
								icon={Icon.Upload}
								target={
									<ImportConfigForm
										entries={entries}
										defaultBrowserCommand={defaultBrowserCommand}
										defaultBrowserArgsTemplate={defaultBrowserArgsTemplate}
										onImportEntries={handleImportEntries}
									/>
								}
							/>
						</ActionPanel>
					}
				/>
			) : (
				entries.map((entry) => (
					<List.Item
						key={entry.id}
						id={entry.id}
						title={entry.name}
						subtitle={entry.comment || hostnameFromUrl(entry.url)}
						icon={entryToIcon(entry)}
						keywords={[
							entry.name,
							entry.url,
							entry.desktopFileName,
							hostnameFromUrl(entry.url),
						]}
						accessories={buildAccessories(entry)}
						actions={
							<ActionPanel>
								<Action.Push
									title="Edit Desktop Entry"
									icon={Icon.Pencil}
									autoFocus
									target={
										<EntryForm
											mode="edit"
											entry={entry}
											defaultBrowserCommand={defaultBrowserCommand}
											defaultBrowserArgsTemplate={defaultBrowserArgsTemplate}
											onSubmitEntry={upsertEntry}
										/>
									}
								/>
								<Action.Push
									title="Create Desktop Entry"
									icon={Icon.Plus}
									shortcut={{ key: "enter", modifiers: ["shift"] }}
									target={createEntryTarget(guessUrlFromSearch(searchText))}
								/>
								<Action
									title="Export Webapp Config"
									icon={Icon.Download}
									onAction={() => void handleExportConfig()}
								/>
								<Action
									title="Refresh All Favicons"
									icon={Icon.ArrowClockwise}
									onAction={() => void handleRefreshAllFavicons()}
								/>
								<Action.Push
									title="Import Webapp Config"
									icon={Icon.Upload}
									target={
										<ImportConfigForm
											entries={entries}
											defaultBrowserCommand={defaultBrowserCommand}
											defaultBrowserArgsTemplate={defaultBrowserArgsTemplate}
											onImportEntries={handleImportEntries}
										/>
									}
								/>
								<Action.ShowInFinder
									title="Show Export File"
									path={exportFilePath}
								/>
								<Action
									title="Open Webapp"
									icon={Icon.Globe01}
									onAction={() => void launchEntry(entry, launcherDirectory)}
								/>
								<Action
									title="Install Global Shortcuts"
									icon={Icon.Keyboard}
									onAction={() => void handleInstallGlobalShortcuts()}
								/>
								<Action
									title="Refresh Favicon"
									icon={Icon.ArrowClockwise}
									onAction={() => void handleRefreshFavicon(entry)}
								/>
								<Action.OpenInBrowser title="Open URL" url={entry.url} />
								<Action.ShowInFinder
									title="Show Desktop File"
									path={entry.desktopFilePath}
								/>
								<Action.CopyToClipboard title="Copy URL" content={entry.url} />
								<Action
									title="Delete Desktop Entry"
									icon={Icon.Trash}
									style={Action.Style.Destructive}
									onAction={() => void handleDelete(entry)}
								/>
							</ActionPanel>
						}
					/>
				))
			)}
		</List>
	);
}

function EntryForm(props: EntryFormProps) {
	const { pop } = useNavigation();
	const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

	const existing = props.entry;
	const formTitle =
		props.mode === "create" ? "Create Desktop Entry" : "Edit Desktop Entry";
	const [singleWindow, setSingleWindow] = useState<boolean>(
		existing?.singleWindow || false,
	);
	const [windowMatchMode, setWindowMatchMode] = useState(
		existing?.windowMatchMode || DEFAULT_WINDOW_MATCH_MODE,
	);

	useEffect(() => {
		setSingleWindow(existing?.singleWindow || false);
		setWindowMatchMode(existing?.windowMatchMode || DEFAULT_WINDOW_MATCH_MODE);
	}, [existing?.id, existing?.singleWindow, existing?.windowMatchMode]);

	const handleSubmit = useCallback(
		async (values: Form.Values) => {
			if (isSubmitting) {
				return;
			}

			const draft: EntryDraft = {
				name: getStringValue(values, "name"),
				url: getStringValue(values, "url"),
				comment: getStringValue(values, "comment"),
				shortcut: normalizeShortcut(getStringValue(values, "shortcut")),
				browserCommand: getStringValue(values, "browserCommand"),
				browserArgsTemplate: getStringValue(values, "browserArgsTemplate"),
				singleWindow,
				windowMatchMode: parseWindowMatchMode(windowMatchMode),
				downloadFavicon: true,
			};

			if (!draft.name.trim()) {
				await showToast({
					style: Toast.Style.Failure,
					title: "Name is required",
				});
				return;
			}
			if (!draft.url.trim()) {
				await showToast({
					style: Toast.Style.Failure,
					title: "URL is required",
				});
				return;
			}
			if (draft.shortcut && !isValidGlobalShortcut(draft.shortcut)) {
				await showToast({
					style: Toast.Style.Failure,
					title: "Shortcut is invalid",
					message: "Use values like ctrl+shift+g or alt+space.",
				});
				return;
			}

			setIsSubmitting(true);
			try {
				await props.onSubmitEntry(draft, existing);
				pop();
			} catch {
				// error toast is shown by the parent handler
			} finally {
				setIsSubmitting(false);
			}
		},
		[existing, isSubmitting, pop, props, singleWindow, windowMatchMode],
	);

	return (
		<Form
			navigationTitle={formTitle}
			isLoading={isSubmitting}
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title={props.mode === "create" ? "Create Entry" : "Save Changes"}
						onSubmit={handleSubmit}
					/>
				</ActionPanel>
			}
		>
			<Form.TextField
				id="name"
				title="Entry Name"
				placeholder="Google Chat"
				defaultValue={existing?.name}
				autoFocus
			/>
			<Form.TextField
				id="url"
				title="URL"
				placeholder="https://mail.google.com/chat/u/1/#chat/home"
				defaultValue={existing?.url || props.defaultUrl}
			/>
			<Form.TextField
				id="comment"
				title="Comment"
				placeholder="Optional"
				defaultValue={existing?.comment}
			/>
			<Form.TextField
				id="shortcut"
				title="Global Shortcut"
				placeholder="ctrl+shift+g"
				info="Optional global shortcut installed into your window manager config. Use modifiers ctrl, shift, alt/opt, or super/cmd."
				defaultValue={existing?.shortcut}
			/>
			<Form.Separator />
			<Form.TextField
				id="browserCommand"
				title="Browser Command"
				placeholder="chromium-browser"
				info="Executable or command line prefix used in the desktop entry launcher."
				defaultValue={existing?.browserCommand || props.defaultBrowserCommand}
			/>
			<Form.TextField
				id="browserArgsTemplate"
				title="Args Template"
				placeholder="--app={url}"
				info="Supports {url}, {origin}, and {hostname} placeholders."
				defaultValue={
					existing?.browserArgsTemplate || props.defaultBrowserArgsTemplate
				}
			/>
			<Form.Separator />
			<Form.Checkbox
				id="singleWindow"
				title="Window Behavior"
				label="Reuse and focus existing window if already open"
				storeValue={false}
				value={singleWindow}
				onChange={setSingleWindow}
			/>
			<Form.Dropdown
				id="windowMatchMode"
				title="Match Strategy"
				storeValue={false}
				value={windowMatchMode}
				onChange={(newValue) =>
					setWindowMatchMode(parseWindowMatchMode(newValue))
				}
				info="Launcher will auto-detect and remember the match value after first launch."
			>
				<Form.Dropdown.Item value="app-id" title="App ID" />
				<Form.Dropdown.Item value="class" title="Class" />
				<Form.Dropdown.Item value="title" title="Title" />
				<Form.Dropdown.Item value="any" title="Any Field" />
			</Form.Dropdown>
		</Form>
	);
}

function ImportConfigForm(props: ImportConfigFormProps) {
	const { pop } = useNavigation();
	const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
	const [jsonText, setJsonText] = useState<string>("");

	const handlePasteFromClipboard = useCallback(async () => {
		const text = await Clipboard.readText();
		setJsonText(text);
	}, []);

	const handleSubmit = useCallback(
		async (values: Form.Values) => {
			if (isSubmitting) {
				return;
			}

			setIsSubmitting(true);
			try {
				const importText = await readImportText(values, jsonText);
				const importedEntries = parseWebappConfigExport(
					importText,
					props.defaultBrowserCommand,
					props.defaultBrowserArgsTemplate,
				);
				await props.onImportEntries(importedEntries);
				pop();
			} catch (error) {
				await showToast({
					style: Toast.Style.Failure,
					title: "Import failed",
					message: getErrorMessage(error),
				});
			} finally {
				setIsSubmitting(false);
			}
		},
		[
			isSubmitting,
			jsonText,
			pop,
			props.defaultBrowserArgsTemplate,
			props.defaultBrowserCommand,
			props.onImportEntries,
		],
	);

	return (
		<Form
			navigationTitle="Import Webapp Config"
			isLoading={isSubmitting}
			actions={
				<ActionPanel>
					<Action.SubmitForm title="Import Config" onSubmit={handleSubmit} />
					<Action
						title="Paste JSON From Clipboard"
						icon={Icon.CopyClipboard}
						onAction={() => void handlePasteFromClipboard()}
					/>
				</ActionPanel>
			}
		>
			<Form.Description
				title="Import Behavior"
				text={`Imports JSON exported by this extension. Existing entries are updated when the exported ID, or the same name and URL, already exists. Current entries: ${props.entries.length}.`}
			/>
			<Form.FilePicker
				id="configFile"
				title="JSON File"
				allowMultipleSelection={false}
				canChooseDirectories={false}
				canChooseFiles
			/>
			<Form.TextArea
				id="configJson"
				title="JSON"
				value={jsonText}
				onChange={setJsonText}
			/>
		</Form>
	);
}

function getStringValue(values: Form.Values, key: string): string {
	const value = values[key];
	return typeof value === "string" ? value : "";
}

function getStringArrayValue(values: Form.Values, key: string): string[] {
	const value = values[key];
	return Array.isArray(value) && value.every((item) => typeof item === "string")
		? value
		: [];
}

async function readImportText(
	values: Form.Values,
	fallbackJsonText: string,
): Promise<string> {
	const configFiles = getStringArrayValue(values, "configFile");
	if (configFiles[0]) {
		return fs.readFile(configFiles[0], "utf8");
	}

	const formJsonText = getStringValue(values, "configJson");
	const importText = formJsonText.trim() || fallbackJsonText.trim();
	if (!importText) {
		throw new Error("Choose a JSON file or paste exported JSON.");
	}
	return importText;
}

function buildConfigExport(entries: ManagedDesktopEntry[]): WebappConfigExport {
	return {
		schema: "vicinae-webapp-config",
		version: 1,
		exportedAt: new Date().toISOString(),
		entries: entries.map((entry) => ({
			id: entry.id,
			name: entry.name,
			url: entry.url,
			comment: entry.comment,
			shortcut: entry.shortcut,
			browserCommand: entry.browserCommand,
			browserArgsTemplate: entry.browserArgsTemplate,
			singleWindow: entry.singleWindow,
			windowMatchMode: entry.windowMatchMode,
		})),
	};
}

function parseWebappConfigExport(
	jsonText: string,
	defaultBrowserCommand: string,
	defaultBrowserArgsTemplate: string,
): WebappConfigEntry[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonText);
	} catch {
		throw new Error("JSON is invalid.");
	}

	const rawEntries = Array.isArray(parsed)
		? parsed
		: isRecord(parsed) && Array.isArray(parsed.entries)
			? parsed.entries
			: undefined;
	if (!rawEntries) {
		throw new Error("JSON must contain an entries array.");
	}

	const entries = rawEntries.map((entry, index) =>
		parseWebappConfigEntry(
			entry,
			index,
			defaultBrowserCommand,
			defaultBrowserArgsTemplate,
		),
	);
	if (entries.length === 0) {
		throw new Error("Config does not contain any webapp entries.");
	}

	return entries;
}

function parseWebappConfigEntry(
	value: unknown,
	index: number,
	defaultBrowserCommand: string,
	defaultBrowserArgsTemplate: string,
): WebappConfigEntry {
	if (!isRecord(value)) {
		throw new Error(`Entry ${index + 1} must be an object.`);
	}

	const name = optionalString(value.name)?.trim();
	const url = optionalString(value.url)?.trim();
	if (!name) {
		throw new Error(`Entry ${index + 1} is missing a name.`);
	}
	if (!url) {
		throw new Error(`Entry ${index + 1} is missing a URL.`);
	}

	const shortcut = normalizeShortcut(optionalString(value.shortcut) || "");
	if (shortcut && !isValidGlobalShortcut(shortcut)) {
		throw new Error(`Entry ${index + 1} has an invalid shortcut.`);
	}

	return {
		id: optionalString(value.id)?.trim() || undefined,
		name,
		url,
		comment: optionalString(value.comment)?.trim() || undefined,
		shortcut,
		browserCommand:
			optionalString(value.browserCommand)?.trim() || defaultBrowserCommand,
		browserArgsTemplate:
			optionalString(value.browserArgsTemplate)?.trim() ||
			defaultBrowserArgsTemplate,
		singleWindow:
			typeof value.singleWindow === "boolean" ? value.singleWindow : false,
		windowMatchMode: parseWindowMatchMode(value.windowMatchMode),
	};
}

function configEntryToDraft(entry: WebappConfigEntry): EntryDraft {
	return {
		name: entry.name,
		url: entry.url,
		comment: entry.comment,
		shortcut: entry.shortcut,
		browserCommand: entry.browserCommand,
		browserArgsTemplate: entry.browserArgsTemplate,
		singleWindow: entry.singleWindow,
		windowMatchMode: parseWindowMatchMode(entry.windowMatchMode),
		downloadFavicon: true,
	};
}

function entryToDraft(
	entry: ManagedDesktopEntry,
	downloadFavicon: boolean,
): EntryDraft {
	return {
		name: entry.name,
		url: entry.url,
		comment: entry.comment,
		shortcut: entry.shortcut,
		browserCommand: entry.browserCommand,
		browserArgsTemplate: entry.browserArgsTemplate,
		singleWindow: entry.singleWindow,
		windowMatchMode: entry.windowMatchMode,
		downloadFavicon,
	};
}

function findMatchingImportEntry(
	importedEntry: WebappConfigEntry,
	entries: ManagedDesktopEntry[],
): ManagedDesktopEntry | undefined {
	if (importedEntry.id) {
		const idMatch = entries.find((entry) => entry.id === importedEntry.id);
		if (idMatch) {
			return idMatch;
		}
	}

	const importedComparableUrl = comparableUrl(importedEntry.url);
	return entries.find(
		(entry) =>
			entry.name === importedEntry.name &&
			comparableUrl(entry.url) === importedComparableUrl,
	);
}

function comparableUrl(url: string): string {
	try {
		return new URL(url).toString();
	} catch {
		return url.trim();
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function buildAccessories(entry: ManagedDesktopEntry): List.Item.Accessory[] {
	const accessories: List.Item.Accessory[] = [];
	if (entry.shortcut) {
		accessories.push({ icon: Icon.Keyboard, text: entry.shortcut });
	}
	if (entry.singleWindow) {
		accessories.push({ tag: `single:${entry.windowMatchMode}` });
	}
	accessories.push({ text: hostnameFromUrl(entry.url) || "url" });
	if (entry.updatedAt) {
		accessories.push({ text: entry.updatedAt });
	} else {
		accessories.push({ text: entry.desktopFileName });
	}
	return accessories;
}

function entryToIcon(entry: ManagedDesktopEntry): URL | string | Icon {
	if (entry.icon) {
		if (/^https?:\/\//i.test(entry.icon)) {
			try {
				return new URL(entry.icon);
			} catch {
				return Icon.Globe;
			}
		}

		if (
			path.isAbsolute(entry.icon) ||
			entry.icon.startsWith("./") ||
			entry.icon.startsWith("../")
		) {
			return entry.icon;
		}

		return Icon.Globe;
	}

	try {
		return new URL("/favicon.ico", entry.url);
	} catch {
		return Icon.Globe;
	}
}

function guessUrlFromSearch(searchText: string): string | undefined {
	const trimmed = searchText.trim();
	if (!trimmed) {
		return undefined;
	}

	if (trimmed.includes(" ")) {
		return undefined;
	}

	if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) {
		return trimmed;
	}

	if (trimmed.includes(".")) {
		return `https://${trimmed}`;
	}

	return undefined;
}

async function launchEntry(
	entry: ManagedDesktopEntry,
	launcherDirectory: string,
): Promise<void> {
	const launcherScriptPath = launchScriptPathForEntry(entry, launcherDirectory);
	const toast = await showToast({
		style: Toast.Style.Animated,
		title: "Opening webapp...",
		message: entry.name,
	});

	try {
		await new Promise<void>((resolve, reject) => {
			const child = spawn(launcherScriptPath, {
				detached: true,
				stdio: "ignore",
			});
			child.once("error", reject);
			child.once("spawn", () => {
				child.unref();
				resolve();
			});
		});
		toast.style = Toast.Style.Success;
		toast.title = "Webapp opened";
		toast.message = entry.name;
	} catch (error) {
		toast.style = Toast.Style.Failure;
		toast.title = "Failed to open webapp";
		toast.message = getErrorMessage(error);
	}
}

async function installGlobalShortcutConfig(
	options: InstallGlobalShortcutConfigOptions,
): Promise<number> {
	const entriesWithShortcuts = options.entries.filter((entry) =>
		Boolean(entry.shortcut?.trim()),
	);

	const installTarget = getShortcutInstallTarget(options.windowManager);
	if (!installTarget) {
		if (entriesWithShortcuts.length === 0) {
			return 0;
		}
		throw new Error("Choose niri, Hyprland, Sway, or i3 in preferences.");
	}

	for (const entry of entriesWithShortcuts) {
		await saveManagedEntry({
			directory: options.directory,
			iconDirectory: options.iconDirectory,
			launcherDirectory: options.launcherDirectory,
			stateDirectory: options.stateDirectory,
			windowManager: options.windowManager,
			customFocusCommandTemplate: options.customFocusCommandTemplate,
			draft: entryToDraft(entry, false),
			existingEntry: entry,
		});
	}

	const configText = buildShortcutConfig(
		entriesWithShortcuts,
		installTarget.windowManager,
		options.launcherDirectory,
	);
	await fs.mkdir(path.dirname(installTarget.shortcutConfigPath), {
		recursive: true,
	});
	await fs.writeFile(installTarget.shortcutConfigPath, configText, "utf8");
	await ensureConfigIncludes(installTarget);
	if (installTarget.reloadCommand) {
		await runBestEffortCommand(installTarget.reloadCommand);
	}

	return entriesWithShortcuts.length;
}

function getShortcutInstallTarget(
	windowManager: WindowManager,
): ShortcutInstallTarget | undefined {
	const configHome =
		process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");

	switch (windowManager) {
		case "niri": {
			const mainConfigPath = path.join(configHome, "niri", "config.kdl");
			return {
				windowManager,
				mainConfigPath,
				shortcutConfigPath: path.join(
					configHome,
					"niri",
					"vicinae-webapps.kdl",
				),
				includeLine: 'include "vicinae-webapps.kdl"',
			};
		}
		case "hyprland": {
			const shortcutConfigPath = path.join(
				configHome,
				"hypr",
				"vicinae-webapps.conf",
			);
			return {
				windowManager,
				mainConfigPath: path.join(configHome, "hypr", "hyprland.conf"),
				shortcutConfigPath,
				includeLine: `source = ${shortcutConfigPath}`,
				reloadCommand: ["hyprctl", "reload"],
			};
		}
		case "sway": {
			const shortcutConfigPath = path.join(
				configHome,
				"sway",
				"vicinae-webapps.conf",
			);
			return {
				windowManager,
				mainConfigPath: path.join(configHome, "sway", "config"),
				shortcutConfigPath,
				includeLine: `include ${shortcutConfigPath}`,
				reloadCommand: ["swaymsg", "reload"],
			};
		}
		case "i3": {
			const shortcutConfigPath = path.join(
				configHome,
				"i3",
				"vicinae-webapps.conf",
			);
			return {
				windowManager,
				mainConfigPath: path.join(configHome, "i3", "config"),
				shortcutConfigPath,
				includeLine: `include ${shortcutConfigPath}`,
				reloadCommand: ["i3-msg", "reload"],
			};
		}
		case "custom":
			return undefined;
	}
}

function buildShortcutConfig(
	entries: ManagedDesktopEntry[],
	windowManager: WindowManager,
	launcherDirectory: string,
): string {
	const generatedAt = new Date().toISOString();
	const lines = [
		commentForWindowManager(
			windowManager,
			"Generated by Vicinae Manage Webapps.",
		),
		commentForWindowManager(
			windowManager,
			"Re-run Install Global Shortcuts after changing webapps.",
		),
		commentForWindowManager(windowManager, `Generated at ${generatedAt}.`),
		"",
	];
	const seenShortcuts = new Map<string, string>();
	const bindings = entries.map((entry) => {
		const shortcut = parseGlobalShortcut(entry.shortcut);
		const duplicateEntryName = seenShortcuts.get(shortcut.normalized);
		if (duplicateEntryName) {
			throw new Error(
				`Duplicate shortcut ${entry.shortcut} for ${duplicateEntryName} and ${entry.name}.`,
			);
		}
		seenShortcuts.set(shortcut.normalized, entry.name);

		return buildShortcutBinding(
			entry,
			shortcut,
			windowManager,
			launchScriptPathForEntry(entry, launcherDirectory),
		);
	});

	if (windowManager === "niri") {
		return `${lines.join("\n")}binds {\n${bindings.map((line) => `    ${line}`).join("\n")}\n}\n`;
	}

	return `${lines.join("\n")}${bindings.join("\n")}\n`;
}

function buildShortcutBinding(
	entry: ManagedDesktopEntry,
	shortcut: GlobalShortcut,
	windowManager: WindowManager,
	commandPath: string,
): string {
	switch (windowManager) {
		case "niri":
			return `${formatShortcutForNiri(shortcut)} hotkey-overlay-title=${quoteKdlString(`Open ${entry.name}`)} { spawn "env" "VICINAE_FORCE_SINGLE_WINDOW=1" ${quoteKdlString(commandPath)}; }`;
		case "hyprland":
			return `bind = ${formatModifiersForHyprland(shortcut.modifiers)}, ${formatKeyForHyprland(shortcut.key)}, exec, env VICINAE_FORCE_SINGLE_WINDOW=1 ${shellQuote(commandPath)}`;
		case "sway":
			return `bindsym ${formatShortcutForI3Sway(shortcut)} exec env VICINAE_FORCE_SINGLE_WINDOW=1 ${shellQuote(commandPath)}`;
		case "i3":
			return `bindsym ${formatShortcutForI3Sway(shortcut)} exec --no-startup-id env VICINAE_FORCE_SINGLE_WINDOW=1 ${shellQuote(commandPath)}`;
		case "custom":
			throw new Error(
				"Global shortcut install is not supported for custom window manager.",
			);
	}
}

function commentForWindowManager(
	windowManager: WindowManager,
	text: string,
): string {
	return windowManager === "niri" ? `// ${text}` : `# ${text}`;
}

async function ensureConfigIncludes(
	installTarget: ShortcutInstallTarget,
): Promise<void> {
	let mainConfig: string;
	try {
		mainConfig = await fs.readFile(installTarget.mainConfigPath, "utf8");
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			throw new Error(
				`Window manager config not found: ${installTarget.mainConfigPath}`,
			);
		}
		throw error;
	}

	if (mainConfig.includes(installTarget.includeLine)) {
		return;
	}

	const separator = mainConfig.endsWith("\n") ? "" : "\n";
	await fs.writeFile(
		installTarget.mainConfigPath,
		`${mainConfig}${separator}\n${commentForWindowManager(installTarget.windowManager, "Vicinae webapp global shortcuts")}\n${installTarget.includeLine}\n`,
		"utf8",
	);
}

async function runBestEffortCommand(command: string[]): Promise<void> {
	await new Promise<void>((resolve) => {
		const child = spawn(command[0], command.slice(1), {
			detached: true,
			stdio: "ignore",
		});
		child.once("error", () => resolve());
		child.once("spawn", () => {
			child.unref();
			resolve();
		});
	});
}

function parseGlobalShortcut(value: string | undefined): GlobalShortcut {
	if (!value) {
		throw new Error("Shortcut is empty.");
	}

	const parts = value
		.split("+")
		.map((part) => part.trim())
		.filter(Boolean);
	if (parts.length < 2) {
		throw new Error("Shortcut must contain at least one modifier and one key.");
	}

	const modifiers = parts.slice(0, -1).map((modifierPart) => {
		const modifier = SHORTCUT_MODIFIER_ALIASES[modifierPart.toLowerCase()];
		if (!modifier) {
			throw new Error(`Unsupported shortcut modifier: ${modifierPart}`);
		}
		return modifier;
	});
	const uniqueModifiers = Array.from(new Set(modifiers));
	if (uniqueModifiers.length !== modifiers.length) {
		throw new Error("Shortcut contains a duplicate modifier.");
	}

	const keyPart = parts[parts.length - 1];
	const key =
		SHORTCUT_KEY_ALIASES[keyPart.toLowerCase()] || keyPart.toLowerCase();
	if (!SHORTCUT_KEYS.has(key)) {
		throw new Error(`Unsupported shortcut key: ${keyPart}`);
	}

	return {
		modifiers: uniqueModifiers,
		key,
		normalized: `${[...uniqueModifiers].sort().join("+")}+${key}`,
	};
}

function isValidGlobalShortcut(value: string): boolean {
	try {
		parseGlobalShortcut(value);
		return true;
	} catch {
		return false;
	}
}

function formatShortcutForNiri(shortcut: GlobalShortcut): string {
	return [
		...shortcut.modifiers.map(formatModifierForNiri),
		formatKeyForNiri(shortcut.key),
	].join("+");
}

function formatModifierForNiri(modifier: string): string {
	switch (modifier) {
		case "cmd":
			return "Super";
		case "ctrl":
			return "Ctrl";
		case "opt":
			return "Alt";
		case "shift":
			return "Shift";
		default:
			return modifier;
	}
}

function formatModifiersForHyprland(modifiers: string[]): string {
	return modifiers.map(formatModifierForHyprland).join(" ");
}

function formatModifierForHyprland(modifier: string): string {
	switch (modifier) {
		case "cmd":
			return "SUPER";
		case "ctrl":
			return "CTRL";
		case "opt":
			return "ALT";
		case "shift":
			return "SHIFT";
		default:
			return modifier.toUpperCase();
	}
}

function formatShortcutForI3Sway(shortcut: GlobalShortcut): string {
	return [
		...shortcut.modifiers.map(formatModifierForI3Sway),
		formatKeyForI3Sway(shortcut.key),
	].join("+");
}

function formatModifierForI3Sway(modifier: string): string {
	switch (modifier) {
		case "cmd":
			return "Mod4";
		case "ctrl":
			return "Ctrl";
		case "opt":
			return "Mod1";
		case "shift":
			return "Shift";
		default:
			return modifier;
	}
}

function formatKeyForNiri(key: string): string {
	if (/^[a-z]$/.test(key)) {
		return key.toUpperCase();
	}

	const aliases: Record<string, string> = {
		arrowDown: "Down",
		arrowLeft: "Left",
		arrowRight: "Right",
		arrowUp: "Up",
		backspace: "BackSpace",
		delete: "Delete",
		deleteForward: "Delete",
		end: "End",
		enter: "Return",
		escape: "Escape",
		home: "Home",
		pageDown: "Page_Down",
		pageUp: "Page_Up",
		return: "Return",
		space: "Space",
		tab: "Tab",
	};
	return aliases[key] || key;
}

function formatKeyForHyprland(key: string): string {
	if (/^[a-z]$/.test(key)) {
		return key.toUpperCase();
	}

	const aliases: Record<string, string> = {
		arrowDown: "down",
		arrowLeft: "left",
		arrowRight: "right",
		arrowUp: "up",
		backspace: "backspace",
		delete: "delete",
		deleteForward: "delete",
		enter: "return",
		escape: "escape",
		pageDown: "pagedown",
		pageUp: "pageup",
		return: "return",
		space: "space",
		tab: "tab",
	};
	return aliases[key] || key;
}

function formatKeyForI3Sway(key: string): string {
	const aliases: Record<string, string> = {
		arrowDown: "Down",
		arrowLeft: "Left",
		arrowRight: "Right",
		arrowUp: "Up",
		backspace: "BackSpace",
		delete: "Delete",
		deleteForward: "Delete",
		enter: "Return",
		escape: "Escape",
		pageDown: "Next",
		pageUp: "Prior",
		return: "Return",
		space: "space",
		tab: "Tab",
	};
	return aliases[key] || key;
}

function quoteKdlString(value: string): string {
	return JSON.stringify(value);
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

const SHORTCUT_MODIFIER_ALIASES: Record<string, string> = {
	alt: "opt",
	cmd: "cmd",
	command: "cmd",
	control: "ctrl",
	ctrl: "ctrl",
	meta: "cmd",
	option: "opt",
	opt: "opt",
	shift: "shift",
	super: "cmd",
	win: "cmd",
};

const SHORTCUT_KEY_ALIASES: Record<string, string> = {
	backspace: "backspace",
	delete: "delete",
	deleteforward: "deleteForward",
	down: "arrowDown",
	enter: "enter",
	esc: "escape",
	escape: "escape",
	left: "arrowLeft",
	pagedown: "pageDown",
	pageup: "pageUp",
	plus: "+",
	return: "return",
	right: "arrowRight",
	space: "space",
	tab: "tab",
	up: "arrowUp",
};

const SHORTCUT_KEYS = new Set<string>([
	..."abcdefghijklmnopqrstuvwxyz0123456789".split(""),
	".",
	",",
	";",
	"=",
	"+",
	"-",
	"[",
	"]",
	"{",
	"}",
	"(",
	")",
	"/",
	"\\",
	"'",
	"`",
	"^",
	"@",
	"$",
	"home",
	"end",
	"deleteForward",
	"arrowUp",
	"arrowDown",
	"arrowLeft",
	"arrowRight",
	"pageUp",
	"pageDown",
	...Object.values(SHORTCUT_KEY_ALIASES),
]);

function normalizeShortcut(value: string): string | undefined {
	const trimmed = value.trim();
	return trimmed ? trimmed.toLowerCase().replace(/\s+/g, "") : undefined;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Unknown error";
}
