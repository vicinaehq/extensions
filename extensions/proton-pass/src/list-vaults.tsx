import {
	Action,
	ActionPanel,
	Clipboard,
	getPreferenceValues,
	Icon,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import {
	clearCache,
	currentCacheEpoch,
	getCachedVaultItems,
	getCachedVaults,
	setCachedVaultItems,
	setCachedVaults,
} from "./cache";
import { copyProtected } from "./clipboard";
import {
	getTotp,
	listItems,
	listVaults,
	type PassItem,
	type Vault,
	viewItem,
} from "./pass-cli";
import { ItemDetailView } from "./search-items";
import { totpItemKey, totpTimerColor, useTotpCodes } from "./totp-state";

type Preferences = {
	enableBackgroundRefresh?: boolean;
};

async function copyValue(
	title: string,
	value: string,
	sensitive = false,
): Promise<void> {
	if (sensitive) await copyProtected(value);
	else await Clipboard.copy(value, { concealed: true });
	await showToast({ style: Toast.Style.Success, title: `${title} copied` });
}

async function safely(action: () => Promise<void>): Promise<void> {
	try {
		await action();
	} catch (reason: unknown) {
		await showToast({
			style: Toast.Style.Failure,
			title: "Proton Pass action failed",
			message: reason instanceof Error ? reason.message : String(reason),
		});
	}
}

function VaultItems({ vault }: { vault: Vault }) {
	const [items, setItems] = useState<PassItem[]>([]);
	const [error, setError] = useState<string>();
	const [loading, setLoading] = useState(true);
	const backgroundRefresh =
		getPreferenceValues<Preferences>().enableBackgroundRefresh !== false;
	const { codes, remaining } = useTotpCodes(items);

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
	}, [backgroundRefresh, vault]);

	return (
		<List
			isLoading={loading}
			navigationTitle={vault.name}
			searchBarPlaceholder="Search items..."
		>
			{error ? (
				<List.EmptyView
					icon={Icon.Warning}
					title="Unable to load vault items"
					description={error}
				/>
			) : items.length === 0 && !loading ? (
				<List.EmptyView icon={Icon.Folder} title="No items in this vault" />
			) : (
				items.map((item) => (
					<List.Item
						key={`${item.shareId}:${item.itemId}`}
						title={item.title}
						subtitle={item.username ?? item.email ?? item.type}
						icon={item.hasTotp ? Icon.Lock : Icon.Key}
						accessories={
							item.hasTotp
								? [
										{
											tag: {
												value: codes[totpItemKey(item)] ?? "---",
												color: totpTimerColor(remaining),
											},
										},
										{ text: `${remaining}s`, icon: Icon.Clock },
									]
								: []
						}
						actions={
							<ActionPanel>
								<Action.Push
									title="View Details"
									icon={Icon.Eye}
									target={<ItemDetailView item={item} />}
								/>
								{item.username || item.email ? (
									<Action
										title={item.username ? "Copy Username" : "Copy Email"}
										icon={item.username ? Icon.Person : Icon.Envelope}
										onAction={() =>
											void safely(() =>
												copyValue(
													item.username ? "Username" : "Email",
													item.username ?? item.email ?? "",
												),
											)
										}
									/>
								) : (
									<Action
										title="Find Username or Email"
										icon={Icon.Person}
										onAction={() =>
											void (async () => {
												try {
													const detail = await viewItem(item);
													const value = detail.username ?? detail.email;
													if (!value)
														throw new Error(
															"This item has no username or email.",
														);
													await copyValue(
														detail.username ? "Username" : "Email",
														value,
													);
												} catch (reason: unknown) {
													await showToast({
														style: Toast.Style.Failure,
														title: "Unable to copy username or email",
														message:
															reason instanceof Error
																? reason.message
																: String(reason),
													});
												}
											})()
										}
									/>
								)}
								{item.username && item.email && (
									<Action
										title="Copy Email"
										icon={Icon.Envelope}
										onAction={() =>
											void safely(() => copyValue("Email", item.email ?? ""))
										}
									/>
								)}
								<Action
									title="Copy Password"
									icon={Icon.Key}
									onAction={() =>
										void (async () => {
											try {
												const detail = await viewItem(item);
												if (!detail.password)
													throw new Error("This item has no password.");
												await copyValue("Password", detail.password, true);
											} catch (reason: unknown) {
												await showToast({
													style: Toast.Style.Failure,
													title: "Unable to copy password",
													message:
														reason instanceof Error
															? reason.message
															: String(reason),
												});
											}
										})()
									}
								/>
								<Action
									title="Copy TOTP Code"
									icon={Icon.Clock}
									onAction={() =>
										void (async () => {
											try {
												await copyValue("TOTP code", await getTotp(item), true);
											} catch (reason: unknown) {
												await showToast({
													style: Toast.Style.Failure,
													title: "Unable to copy TOTP code",
													message:
														reason instanceof Error
															? reason.message
															: String(reason),
												});
											}
										})()
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
				if (!cached.isStale || !backgroundRefresh) {
					setLoading(false);
					return;
				}
			}
			try {
				const fresh = await listVaults();
				await setCachedVaults(fresh, epoch);
				if (active) setVaults(fresh);
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
						subtitle={vault.role ?? "Proton Pass vault"}
						accessories={
							vault.itemCount === undefined
								? []
								: [{ text: `${vault.itemCount} items` }]
						}
						icon={Icon.Folder}
						actions={
							<ActionPanel>
								<Action.Push
									title="View Items"
									icon={Icon.Folder}
									target={<VaultItems vault={vault} />}
								/>
								<Action
									title="Copy Vault Name"
									icon={Icon.CopyClipboard}
									onAction={() =>
										void safely(() => copyValue("Vault name", vault.name))
									}
								/>
								<Action
									title="Copy Share ID"
									icon={Icon.CopyClipboard}
									onAction={() =>
										void safely(() => copyValue("Share ID", vault.shareId))
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
