import {
	Action,
	ActionPanel,
	getPreferenceValues,
	Icon,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";
import { copySecret, roleStyle, SHORTCUTS, vaultColor } from "./actions";
import {
	clearCache,
	currentCacheEpoch,
	getCachedSnapshot,
	setCachedSnapshot,
} from "./cache";
import {
	getTotp,
	listVaultsAndItems,
	type PassItem,
	type Vault,
} from "./pass-cli";
import { totpItemKey, totpTimerColor, useTotpCodes } from "./totp-state";

type Preferences = {
	enableBackgroundRefresh?: boolean;
};

export default function Command() {
	const [items, setItems] = useState<PassItem[]>([]);
	const [vaults, setVaults] = useState<Vault[]>([]);
	const [error, setError] = useState<string>();
	const [loading, setLoading] = useState(true);
	const backgroundRefresh =
		getPreferenceValues<Preferences>().enableBackgroundRefresh !== false;
	const totpItems = useMemo(
		() => items.filter((item) => item.hasTotp),
		[items],
	);
	const roleByShareId = useMemo(
		() => new Map(vaults.map((vault) => [vault.shareId, vault.role])),
		[vaults],
	);
	const { codes, remaining, refreshing, refresh } = useTotpCodes(totpItems);

	useEffect(() => {
		let active = true;
		async function loadItems(): Promise<void> {
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
						{
							vaults: fresh.vaults,
							items: fresh.items,
						},
						epoch,
					);
					if (active) {
						setVaults(fresh.vaults);
						setItems(fresh.items);
					}
				}
			} catch (reason: unknown) {
				const message =
					reason instanceof Error ? reason.message : String(reason);
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
	}, [backgroundRefresh]);

	async function copy(item: PassItem): Promise<void> {
		try {
			const code = codes[totpItemKey(item)] ?? (await getTotp(item));
			await copySecret(`${item.title} TOTP`, code, { sensitive: true });
		} catch (reason: unknown) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Unable to copy TOTP code",
				message: reason instanceof Error ? reason.message : String(reason),
			});
		}
	}

	return (
		<List
			isLoading={loading || refreshing}
			searchBarPlaceholder="Search Proton Pass TOTP items..."
		>
			{error ? (
				<List.EmptyView
					icon={Icon.Warning}
					title="Unable to load TOTP items"
					description={error}
				/>
			) : totpItems.length === 0 && !loading ? (
				<List.EmptyView
					icon={Icon.Clock}
					title="No TOTP items found"
					description="No Proton Pass items currently advertise a TOTP code."
				/>
			) : (
				<List.Section
					title="TOTP Codes"
					subtitle={
						refreshing ? "Refreshing…" : `Codes refresh in ${remaining}s`
					}
				>
					{totpItems.map((item) => {
						const role = roleByShareId.get(item.shareId);
						return (
							<List.Item
								key={totpItemKey(item)}
								title={item.title}
								keywords={[
									item.title,
									item.username ?? "",
									item.email ?? "",
									item.vaultName,
									...(item.urls ?? []),
								]}
								icon={{
									source: Icon.Clock,
									tintColor: vaultColor(role, item.vaultName),
								}}
								accessories={[
									{
										tag: {
											value: item.vaultName,
											color: vaultColor(role, item.vaultName),
										},
										icon: roleStyle(role).icon,
										tooltip: `Vault: ${item.vaultName} (${role ?? "unknown"})`,
									},
									{
										tag: {
											value: codes[totpItemKey(item)] ?? "---",
											color: totpTimerColor(remaining),
										},
									},
									{ text: `${remaining}s`, icon: Icon.Clock },
								]}
								actions={
									<ActionPanel>
										<Action
											title="Copy TOTP Code"
											icon={Icon.CopyClipboard}
											shortcut={SHORTCUTS.copyTotp}
											onAction={() => void copy(item)}
										/>
										<Action
											title="Refresh Codes"
											icon={Icon.ArrowClockwise}
											onAction={() => void refresh()}
										/>
									</ActionPanel>
								}
							/>
						);
					})}
				</List.Section>
			)}
		</List>
	);
}
