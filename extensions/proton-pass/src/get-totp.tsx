import {
	Action,
	ActionPanel,
	Icon,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useMemo } from "react";
import { copySecret, roleStyle, SHORTCUTS, vaultColor } from "./actions";
import { errorMessage } from "./cli-contract";
import { getTotp, type PassItem, roleByShareId } from "./pass-cli";
import { useVaultSnapshot } from "./snapshot";
import { totpItemKey, totpTimerColor, useTotpCodes } from "./totp-state";

export default function Command() {
	const { vaults, items, loading, error } = useVaultSnapshot();
	const totpItems = useMemo(
		() => items.filter((item) => item.hasTotp),
		[items],
	);
	const roleMap = useMemo(() => roleByShareId(vaults), [vaults]);
	const { codes, remaining, refreshing, refresh } = useTotpCodes(totpItems);

	async function copy(item: PassItem): Promise<void> {
		try {
			const code = codes[totpItemKey(item)] ?? (await getTotp(item));
			await copySecret(`${item.title} TOTP`, code, { sensitive: true });
		} catch (reason: unknown) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Unable to copy TOTP code",
				message: errorMessage(reason),
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
						const role = roleMap.get(item.shareId);
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
