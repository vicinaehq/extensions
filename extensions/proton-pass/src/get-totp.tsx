import {
	Action,
	ActionPanel,
	Icon,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useMemo } from "react";
import {
	copySecret,
	roleStyle,
	SHORTCUTS,
	safely,
	vaultColor,
} from "./actions";
import { errorMessage } from "./cli-contract";
import { pasteSecret } from "./clipboard";
import { getTotp, type PassItem, roleByShareId } from "./pass-cli";
import { ItemDetailView } from "./search-items";
import { useVaultSnapshot } from "./snapshot";
import { totpItemKey, totpTimerColor, useTotpCodes } from "./totp-state";

function totpProgressIcon(remaining: number): { source: string } {
	const fraction = Math.max(0, Math.min(1, remaining / 30));
	const color = totpTimerColor(remaining);
	const radius = 9;
	const circumference = 2 * Math.PI * radius;
	const dashOffset = circumference * (1 - fraction);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="${radius}" fill="none" stroke="${color}" stroke-opacity="0.28" stroke-width="2.2"/><circle cx="12" cy="12" r="${radius}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}" transform="rotate(-90 12 12)"/></svg>`;
	return { source: `data:image/svg+xml,${encodeURIComponent(svg)}` };
}

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
			isShowingDetail
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
										icon: totpProgressIcon(remaining),
										tooltip: `TOTP expires in ${remaining}s`,
									},
								]}
								detail={<ItemDetailView item={item} vaultRole={role} />}
								actions={
									<ActionPanel>
										<Action
											title="Paste TOTP Code"
											icon={Icon.Clock}
											onAction={() =>
												void safely(async () =>
													pasteSecret(
														codes[totpItemKey(item)] ?? (await getTotp(item)),
													),
												)
											}
										/>
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
