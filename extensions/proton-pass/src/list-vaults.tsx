import {
	Action,
	ActionPanel,
	getPreferenceValues,
	Icon,
	List,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import {
	copySecret,
	roleStyle,
	SHORTCUTS,
	safely,
	vaultColor,
} from "./actions";
import {
	clearCache,
	currentCacheEpoch,
	getCachedVaultItems,
	getCachedVaults,
	setCachedVaultItems,
	setCachedVaults,
} from "./cache";
import { errorMessage } from "./cli-contract";
import {
	listItems,
	listVaultsWithItemCounts,
	type PassItem,
	type Vault,
} from "./pass-cli";
import { ItemRows } from "./search-items";
import { useTotpCodes } from "./totp-state";

type Preferences = {
	enableBackgroundRefresh?: boolean;
};

function VaultItems({ vault }: { vault: Vault }) {
	const [items, setItems] = useState<PassItem[]>([]);
	const [error, setError] = useState<string>();
	const [loading, setLoading] = useState(true);
	const backgroundRefresh =
		getPreferenceValues<Preferences>().enableBackgroundRefresh !== false;
	const totpState = useTotpCodes(items);

	useEffect(() => {
		let active = true;
		async function loadItems(): Promise<void> {
			const epoch = currentCacheEpoch();
			const cached = await getCachedVaultItems(vault.shareId);
			if (cached && active) {
				setItems(cached.data);
				if (!cached.isStale || !backgroundRefresh) {
					setLoading(false);
					return;
				}
			}
			try {
				const fresh = await listItems(vault);
				await setCachedVaultItems(vault.shareId, fresh, epoch);
				if (active) setItems(fresh);
			} catch (reason: unknown) {
				const message = errorMessage(reason);
				if (!cached && active) setError(message);
				if (/authenticated|logged in|session/i.test(message))
					await clearCache();
			} finally {
				if (active) setLoading(false);
			}
		}
		void loadItems();
		return () => {
			active = false;
		};
	}, [backgroundRefresh, vault]);

	return (
		<List
			isLoading={loading}
			navigationTitle={vault.name}
			searchBarPlaceholder="Search Proton Pass items..."
		>
			{error ? (
				<List.EmptyView
					icon={Icon.Warning}
					title="Unable to load Proton Pass"
					description={`${error} Check that pass-cli is installed and authenticated.`}
				/>
			) : items.length === 0 && !loading ? (
				<List.EmptyView icon={Icon.Key} title="No Proton Pass items found" />
			) : (
				<ItemRows items={items} vaults={[vault]} totpState={totpState} />
			)}
		</List>
	);
}

export default function Command() {
	const [vaults, setVaults] = useState<Vault[]>([]);
	const [error, setError] = useState<string>();
	const [loading, setLoading] = useState(true);
	const backgroundRefresh =
		getPreferenceValues<Preferences>().enableBackgroundRefresh !== false;

	useEffect(() => {
		let active = true;
		async function loadVaults(): Promise<void> {
			const epoch = currentCacheEpoch();
			const cached = await getCachedVaults();
			if (cached && active) {
				setVaults(cached.data);
				// Treat a cache missing role data as stale: older builds cached
				// vaults without roles, which would otherwise stick as grey.
				const missingRoles = cached.data.some((vault) => !vault.role);
				if ((!cached.isStale && !missingRoles) || !backgroundRefresh) {
					setLoading(false);
					return;
				}
			}
			try {
				const fresh = await listVaultsWithItemCounts();
				await setCachedVaults(fresh, epoch);
				if (active) setVaults(fresh);
			} catch (reason: unknown) {
				const message = errorMessage(reason);
				if (!cached && active) setError(message);
				if (/authenticated|logged in|session/i.test(message))
					await clearCache();
			} finally {
				if (active) setLoading(false);
			}
		}
		void loadVaults();
		return () => {
			active = false;
		};
	}, [backgroundRefresh]);

	return (
		<List
			isLoading={loading}
			searchBarPlaceholder="Search Proton Pass vaults..."
		>
			{error ? (
				<List.EmptyView
					icon={Icon.Warning}
					title="Unable to load vaults"
					description={error}
				/>
			) : vaults.length === 0 && !loading ? (
				<List.EmptyView icon={Icon.Folder} title="No vaults found" />
			) : (
				vaults.map((vault) => (
					<List.Item
						key={vault.shareId}
						title={vault.name}
						accessories={[
							...(vault.itemCount === undefined
								? []
								: [
										{
											text: `${vault.itemCount} item${vault.itemCount === 1 ? "" : "s"}`,
											icon: Icon.Key,
										},
									]),
							{
								tag: {
									value: vault.role ?? "vault",
									color: vaultColor(vault.role, vault.name),
								},
								icon: roleStyle(vault.role).icon,
								tooltip: `Role: ${vault.role ?? "unknown"}`,
							},
						]}
						icon={{
							source: Icon.Folder,
							tintColor: vaultColor(vault.role, vault.name),
						}}
						actions={
							<ActionPanel>
								<ActionPanel.Section title="Vault">
									<Action.Push
										title="View Items"
										icon={Icon.Folder}
										shortcut={SHORTCUTS.viewItems}
										target={<VaultItems vault={vault} />}
									/>
								</ActionPanel.Section>
								<ActionPanel.Section title="Copy">
									<Action
										title="Copy Vault Name"
										icon={Icon.CopyClipboard}
										shortcut={SHORTCUTS.copyVaultName}
										onAction={() =>
											void safely(() => copySecret("Vault name", vault.name))
										}
									/>
									<Action
										title="Copy Share ID"
										icon={Icon.CopyClipboard}
										shortcut={SHORTCUTS.copyShareId}
										onAction={() =>
											void safely(() => copySecret("Share ID", vault.shareId))
										}
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
