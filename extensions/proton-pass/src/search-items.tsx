import {
	Action,
	ActionPanel,
	Clipboard,
	closeMainWindow,
	getPreferenceValues,
	Icon,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import ItemDetailView from "./components/item-detail";
import {
	clearVaultCache,
	isCacheFresh,
	readVaultCache,
	writeVaultCache,
} from "./lib/cache";
import { renderErrorView } from "./lib/error-views";
import {
	checkAuth,
	getItem,
	getTotp,
	listItems,
	listVaults,
	loginWithBrowser,
} from "./lib/pass-cli";
import { Item, PassCliError, Vault } from "./lib/types";
import { formatItemSubtitle, getItemIcon } from "./lib/utils";

const ALL_VAULTS_VALUE = "all";

async function toastError(title: string, error: unknown): Promise<void> {
	await showToast(
		Toast.Style.Failure,
		title,
		error instanceof PassCliError ? error.message : undefined,
	);
}

function VaultDropdown({
	vaults,
	value,
	onChange,
}: {
	vaults: Vault[];
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<List.Dropdown tooltip="Select Vault" value={value} onChange={onChange}>
			<List.Dropdown.Item
				title="All Vaults"
				value={ALL_VAULTS_VALUE}
				icon={Icon.Globe01}
			/>
			<List.Dropdown.Section title="Vaults">
				{vaults.map((vault) => (
					<List.Dropdown.Item
						key={vault.shareId}
						title={vault.name}
						value={vault.shareId}
						icon={Icon.Folder}
					/>
				))}
			</List.Dropdown.Section>
		</List.Dropdown>
	);
}

export default function Command() {
	const [vaults, setVaults] = useState<Vault[]>([]);
	const [items, setItems] = useState<Item[]>([]);
	const [selectedVaultId, setSelectedVaultId] = useState(ALL_VAULTS_VALUE);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<PassCliError | null>(null);

	const load = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const isAuthenticated = await checkAuth();
			if (!isAuthenticated) {
				setError(
					new PassCliError(
						"Not authenticated. Log in to access your vaults.",
						"not_authenticated",
					),
				);
				return;
			}

			const cacheEnabled =
				getPreferenceValues<{ cacheItems?: boolean }>().cacheItems ?? true;
			let showingCache = false;
			if (cacheEnabled) {
				const cached = await readVaultCache();
				if (cached && isCacheFresh(cached)) {
					setVaults(cached.vaults);
					setItems(cached.items.sort((a, b) => a.title.localeCompare(b.title)));
					showingCache = true;
				}
			}

			try {
				const [loadedVaults, loadedItems] = await Promise.all([
					listVaults(),
					listItems(),
				]);
				setVaults(loadedVaults);
				setItems(loadedItems.sort((a, b) => a.title.localeCompare(b.title)));
				if (cacheEnabled) await writeVaultCache(loadedVaults, loadedItems);
			} catch (e) {
				if (showingCache) {
					// Keep rendering the cached list; surface the refresh failure.
					await showToast(
						Toast.Style.Failure,
						"Refresh failed, showing cached data",
						e instanceof PassCliError ? e.message : undefined,
					);
				} else {
					throw e;
				}
			}
		} catch (e) {
			setError(
				e instanceof PassCliError
					? e
					: new PassCliError("Failed to load items", "unknown"),
			);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const handleLogin = useCallback(async () => {
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: "Starting Proton Pass login",
			message: "Complete authentication in your browser",
		});
		try {
			await loginWithBrowser();
			toast.style = Toast.Style.Success;
			toast.title = "Logged in";
			await load();
		} catch (e) {
			toast.style = Toast.Style.Failure;
			toast.title = "Login failed";
			toast.message = e instanceof Error ? e.message : undefined;
		}
	}, [load]);

	const errorView = renderErrorView(error, load, handleLogin);
	if (errorView) return errorView;

	const filteredItems =
		selectedVaultId === ALL_VAULTS_VALUE
			? items
			: items.filter((item) => item.shareId === selectedVaultId);

	return (
		<List
			isLoading={isLoading}
			searchBarPlaceholder="Search items..."
			searchBarAccessory={
				<VaultDropdown
					vaults={vaults}
					value={selectedVaultId}
					onChange={setSelectedVaultId}
				/>
			}
		>
			{filteredItems.length === 0 && !isLoading ? (
				<List.EmptyView
					icon={Icon.MagnifyingGlass}
					title="No Items Found"
					description={
						selectedVaultId === ALL_VAULTS_VALUE
							? "Your vaults are empty"
							: "No items in this vault"
					}
				/>
			) : (
				filteredItems.map((item) => (
					<List.Item
						key={`${item.shareId}-${item.itemId}`}
						icon={getItemIcon(item.type)}
						title={item.title}
						subtitle={formatItemSubtitle(item)}
						accessories={[{ text: item.type }]}
						actions={
							<ActionPanel>
								<ActionPanel.Section>
									<Action.Push
										title="View Details"
										icon={Icon.Eye}
										shortcut={{ modifiers: ["cmd"], key: "d" }}
										target={<ItemDetailView item={item} />}
									/>
								</ActionPanel.Section>
								<ActionPanel.Section title="Copy">
									<Action
										title="Copy Password"
										icon={Icon.Key}
										shortcut={{ modifiers: ["shift"], key: "return" }}
										onAction={async () => {
											try {
												const detail = await getItem(item);
												if (!detail.password) {
													await showToast(
														Toast.Style.Failure,
														"No password found for this item",
													);
													return;
												}
												await Clipboard.copy(detail.password, {
													concealed: true,
												});
												await showToast(Toast.Style.Success, "Password copied");
											} catch (e) {
												await toastError("Failed to copy password", e);
											}
										}}
									/>
									<Action
										title="Copy Email"
										icon={Icon.Envelope}
										shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
										onAction={async () => {
											try {
												const detail = await getItem(item);
												if (!detail.email) {
													await showToast(
														Toast.Style.Failure,
														"No email found for this item",
													);
													return;
												}
												await Clipboard.copy(detail.email, {
													concealed: true,
												});
												await showToast(Toast.Style.Success, "Email copied");
											} catch (e) {
												await toastError("Failed to copy email", e);
											}
										}}
									/>
									<Action
										title="Copy Username"
										icon={Icon.Person}
										shortcut={{ modifiers: ["cmd", "shift"], key: "u" }}
										onAction={async () => {
											try {
												const detail = await getItem(item);
												if (!detail.username) {
													await showToast(
														Toast.Style.Failure,
														"No username found for this item",
													);
													return;
												}
												await Clipboard.copy(detail.username, {
													concealed: true,
												});
												await showToast(Toast.Style.Success, "Username copied");
											} catch (e) {
												await toastError("Failed to copy username", e);
											}
										}}
									/>
									<Action
										title="Copy TOTP Code"
										icon={Icon.Clock}
										shortcut={{ modifiers: ["cmd", "shift"], key: "t" }}
										onAction={async () => {
											try {
												const totp = await getTotp(item.shareId, item.itemId);
												await Clipboard.copy(totp, { concealed: true });
												await showToast(
													Toast.Style.Success,
													"TOTP code copied",
												);
											} catch (e) {
												await toastError("Failed to get TOTP code", e);
											}
										}}
									/>
								</ActionPanel.Section>
								<ActionPanel.Section title="Paste">
									<Action
										title="Paste Password"
										icon={Icon.Text}
										onAction={async () => {
											try {
												const detail = await getItem(item);
												if (!detail.password) {
													await showToast(
														Toast.Style.Failure,
														"No password found for this item",
													);
													return;
												}
												await Clipboard.paste(detail.password);
												await closeMainWindow();
											} catch (e) {
												await toastError("Failed to paste password", e);
											}
										}}
									/>
								</ActionPanel.Section>
								<ActionPanel.Section title="Vault">
									<Action
										title="Refresh"
										icon={Icon.ArrowClockwise}
										shortcut={{ modifiers: ["cmd"], key: "r" }}
										onAction={load}
									/>
									<Action
										title="Clear Cache"
										icon={Icon.Trash}
										onAction={async () => {
											await clearVaultCache();
											await showToast(Toast.Style.Success, "Cache cleared");
										}}
									/>
								</ActionPanel.Section>
							</ActionPanel>
						}
					/>
				))
			)}
		</List>
	);
}
