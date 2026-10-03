import { getPreferenceValues, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";
import {
	clearCache,
	currentCacheEpoch,
	getCachedSnapshot,
	setCachedSnapshot,
} from "./cache";
import { errorMessage } from "./cli-contract";
import { listVaultsAndItems, type PassItem, type Vault } from "./pass-cli";

type Preferences = {
	enableBackgroundRefresh?: boolean;
};

type VaultSnapshot = {
	vaults: Vault[];
	items: PassItem[];
	loading: boolean;
	error?: string;
};

/**
 * Load the vault/item snapshot shared by the search and TOTP commands: serve
 * cached metadata immediately, refresh in the background when stale, surface
 * partial-load failures, and clear the cache if the session is no longer
 * authenticated.
 */
export function useVaultSnapshot(): VaultSnapshot {
	const [vaults, setVaults] = useState<Vault[]>([]);
	const [items, setItems] = useState<PassItem[]>([]);
	const [error, setError] = useState<string>();
	const [loading, setLoading] = useState(true);
	const backgroundRefresh =
		getPreferenceValues<Preferences>().enableBackgroundRefresh !== false;

	useEffect(() => {
		let active = true;
		async function load(): Promise<void> {
			const epoch = currentCacheEpoch();
			const cached = await getCachedSnapshot();
			if (cached && active) {
				setVaults(cached.data.vaults);
				setItems(cached.data.items);
				if (!cached.isStale || !backgroundRefresh) {
					setLoading(false);
					return;
				}
			}
			try {
				const fresh = await listVaultsAndItems();
				if (fresh.failedVaults.length > 0) {
					if (active) {
						setVaults(fresh.vaults);
						setItems(fresh.items);
						await showToast({
							style: Toast.Style.Failure,
							title: "Some Proton Pass vaults could not be loaded",
							message: fresh.failedVaults.join(", "),
						});
					}
				} else {
					await setCachedSnapshot(
						{ vaults: fresh.vaults, items: fresh.items },
						epoch,
					);
					if (active) {
						setVaults(fresh.vaults);
						setItems(fresh.items);
					}
				}
			} catch (reason: unknown) {
				const message = errorMessage(reason);
				if (!cached && active) setError(message);
				if (/authenticated|logged in|session/i.test(message))
					await clearCache();
			} finally {
				if (active) setLoading(false);
			}
		}
		void load();
		return () => {
			active = false;
		};
	}, [backgroundRefresh]);

	return { vaults, items, loading, error };
}
