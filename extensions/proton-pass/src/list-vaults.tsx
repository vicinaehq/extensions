import {
	Action,
	ActionPanel,
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
	listItems,
	listVaults,
	loginWithBrowser,
} from "./lib/pass-cli";
import { Item, PassCliError, Vault } from "./lib/types";
import { getItemIcon } from "./lib/utils";

function VaultItems({ vault }: { vault: Vault }) {
	const [items, setItems] = useState<Item[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	const load = useCallback(async () => {
		setIsLoading(true);
		try {
			setItems(
				(await listItems(vault.shareId)).sort((a, b) =>
					a.title.localeCompare(b.title),
				),
			);
		} catch (e) {
			await showToast(
				Toast.Style.Failure,
				"Failed to load items",
				e instanceof PassCliError ? e.message : undefined,
			);
		} finally {
			setIsLoading(false);
		}
	}, [vault.shareId]);

	useEffect(() => {
		void load();
	}, [load]);

	return (
		<List
			isLoading={isLoading}
			navigationTitle={vault.name}
			searchBarPlaceholder="Search items..."
		>
			{items.length === 0 && !isLoading ? (
				<List.EmptyView icon={Icon.Folder} title="No Items in This Vault" />
			) : (
				items.map((item) => (
					<List.Item
						key={`${item.shareId}-${item.itemId}`}
						icon={getItemIcon(item.type)}
						title={item.title}
						accessories={[{ text: item.type }]}
						actions={
							<ActionPanel>
								<Action.Push
									title="View Details"
									icon={Icon.Eye}
									target={<ItemDetailView item={item} />}
								/>
								<Action.CopyToClipboard
									title="Copy Title"
									content={item.title}
									shortcut="copy"
									onCopy={() => showToast(Toast.Style.Success, "Title copied")}
								/>
							</ActionPanel>
						}
					/>
				))
			)}
		</List>
	);
}

export default function Command() {
	const [vaults, setVaults] = useState<Vault[]>([]);
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
			const cached = cacheEnabled ? await readVaultCache() : undefined;
			let showingCache = false;
			if (cached && isCacheFresh(cached)) {
				setVaults(cached.vaults);
				showingCache = true;
			}

			try {
				const loadedVaults = await listVaults();
				setVaults(loadedVaults);
				if (cacheEnabled) {
					await writeVaultCache(loadedVaults, cached?.items ?? []);
				}
			} catch (e) {
				if (showingCache) {
					// Keep rendering the cached vault list; surface the refresh failure.
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
					: new PassCliError("Failed to load vaults", "unknown"),
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

	return (
		<List isLoading={isLoading} searchBarPlaceholder="Search vaults...">
			{vaults.length === 0 && !isLoading ? (
				<List.EmptyView icon={Icon.Folder} title="No Vaults Found" />
			) : (
				vaults.map((vault) => (
					<List.Item
						key={vault.shareId}
						icon={Icon.Folder}
						title={vault.name}
						actions={
							<ActionPanel>
								<Action.Push
									title="View Items"
									icon={Icon.AppWindowList}
									target={<VaultItems vault={vault} />}
								/>
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
								<Action.CopyToClipboard
									title="Copy Vault Name"
									content={vault.name}
									shortcut="copy"
									onCopy={() =>
										showToast(Toast.Style.Success, "Vault name copied")
									}
								/>
								<Action.CopyToClipboard
									title="Copy Share ID"
									content={vault.shareId}
									shortcut={{ modifiers: ["cmd", "shift"], key: "i" }}
									onCopy={() =>
										showToast(Toast.Style.Success, "Share ID copied")
									}
								/>
							</ActionPanel>
						}
					/>
				))
			)}
		</List>
	);
}
