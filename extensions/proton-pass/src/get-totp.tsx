import {
	Action,
	ActionPanel,
	Detail,
	Icon,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useEffect, useMemo, useRef } from "react";
import { copySecret, SHORTCUTS, safely, vaultColor } from "./actions";
import { errorMessage } from "./cli-contract";
import { pasteSecret } from "./clipboard";
import { getTotp, type PassItem, roleByShareId } from "./pass-cli";
import { useVaultSnapshot } from "./snapshot";
import {
	totpItemKey,
	totpProgressIcon,
	totpTimerColor,
	useTotpCodes,
} from "./totp-state";

function TotpListDetail({
	item,
	role,
	code,
	remaining,
	refreshError,
}: {
	item: PassItem;
	role?: string;
	code?: string;
	remaining: number;
	refreshError?: string;
}) {
	const identity = item.username ?? item.email ?? "—";
	const url = item.urls?.[0];
	const currentText = code
		? { value: code, color: totpTimerColor(remaining) }
		: refreshError
			? "Unavailable"
			: "Refreshing…";
	return (
		<List.Item.Detail
			metadata={
				<Detail.Metadata>
					<Detail.Metadata.Label title="Current" text={currentText} />
					<Detail.Metadata.Label title="Expires in" text={`${remaining}s`} />
					<Detail.Metadata.Separator />
					<Detail.Metadata.Label title="Username / Email" text={identity} />
					<Detail.Metadata.Label
						title="Vault"
						text={{
							value: item.vaultName,
							color: vaultColor(role, item.vaultName),
						}}
					/>
					<Detail.Metadata.Label title="Type" text={item.type} />
					<Detail.Metadata.Separator />
					{url ? (
						<Detail.Metadata.Link title="URL" target={url} text={url} />
					) : (
						<Detail.Metadata.Label title="URL" text="—" />
					)}
				</Detail.Metadata>
			}
		/>
	);
}

export default function Command() {
	const { vaults, items, loading, error } = useVaultSnapshot();
	const totpItems = useMemo(
		() => items.filter((item) => item.hasTotp),
		[items],
	);
	const roleMap = useMemo(() => roleByShareId(vaults), [vaults]);
	const { codes, remaining, refreshing, refreshError, refresh } =
		useTotpCodes(totpItems);
	const lastRefreshError = useRef<string | undefined>(undefined);
	useEffect(() => {
		if (!refreshError) {
			lastRefreshError.current = undefined;
			return;
		}
		if (lastRefreshError.current === refreshError) return;
		lastRefreshError.current = refreshError;
		void showToast({
			style: Toast.Style.Failure,
			title: "Unable to refresh TOTP codes",
			message: refreshError,
		});
	}, [refreshError]);

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
			isLoading={loading}
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
						refreshError ??
						(refreshing ? "Refreshing…" : `Codes refresh in ${remaining}s`)
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
										icon: totpProgressIcon(remaining),
										tooltip: `TOTP expires in ${remaining}s`,
									},
								]}
								detail={
									<TotpListDetail
										item={item}
										role={role}
										code={codes[totpItemKey(item)]}
										remaining={remaining}
										refreshError={refreshError}
									/>
								}
								actions={
									<ActionPanel>
										<ActionPanel.Section title="Current">
											<Action
												title="Paste TOTP Code"
												icon={Icon.Clock}
												shortcut={SHORTCUTS.pasteTotp}
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
										</ActionPanel.Section>
										<ActionPanel.Section title="Actions">
											<Action
												title="Refresh Codes"
												icon={Icon.ArrowClockwise}
												shortcut={SHORTCUTS.refresh}
												onAction={() => void refresh()}
											/>
										</ActionPanel.Section>
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
