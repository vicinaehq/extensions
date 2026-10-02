import {
	Action,
	ActionPanel,
	Clipboard,
	Detail,
	getPreferenceValues,
	Icon,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { memo, useEffect, useMemo, useState } from "react";
import {
	clearCache,
	currentCacheEpoch,
	getCachedSnapshot,
	setCachedSnapshot,
} from "./cache";
import { copyProtected } from "./clipboard";
import {
	getTotp,
	listVaultsAndItems,
	type PassItem,
	type PassItemDetail,
	type Vault,
	viewItem,
} from "./pass-cli";
import { totpItemKey, totpTimerColor, useTotpCodes } from "./totp-state";

type Preferences = {
	enableBackgroundRefresh?: boolean;
};

function itemIcon(item: PassItem): Icon {
	if (item.hasTotp) return Icon.Lock;
	switch (item.type) {
		case "credit_card":
			return Icon.CreditCard;
		case "identity":
			return Icon.PersonCircle;
		case "alias":
			return Icon.Link;
		case "ssh_key":
			return Icon.Key;
		case "wifi":
			return Icon.Wifi;
		case "note":
			return Icon.BlankDocument;
		default:
			return Icon.Key;
	}
}

function escapeMarkdown(value: string): string {
	return value.replace(/([\\`*_[\]<>|])/g, "\\$1");
}

function mask(value: string): string {
	return "•".repeat(Math.min(Math.max(value.length, 8), 24));
}

async function copySecret(
	title: string,
	value: string,
	concealed = true,
	sensitive = false,
): Promise<void> {
	if (sensitive) await copyProtected(value);
	else await Clipboard.copy(value, { concealed });
	await showToast({ style: Toast.Style.Success, title: `${title} copied` });
}

export function ItemDetailView({ item }: { item: PassItem }) {
	const [detail, setDetail] = useState<PassItemDetail>();
	const [error, setError] = useState<string>();
	const totpItems = useMemo(() => (item.hasTotp ? [item] : []), [item]);
	const { codes, remaining, refreshing, refresh } = useTotpCodes(totpItems);
	const currentTotp = codes[totpItemKey(item)];

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

	useEffect(() => {
		let active = true;
		void viewItem(item)
			.then((nextDetail) => {
				if (active) setDetail(nextDetail);
			})
			.catch(
				(reason: unknown) =>
					active &&
					setError(reason instanceof Error ? reason.message : String(reason)),
			);
		return () => {
			active = false;
		};
	}, [item]);

	if (error)
		return (
			<Detail
				navigationTitle={item.title}
				markdown={`# Unable to load item\n\n${escapeMarkdown(error)}`}
			/>
		);
	if (!detail)
		return (
			<Detail
				navigationTitle={item.title}
				markdown="# Loading Proton Pass item…"
			/>
		);

	const lines = [
		`# ${escapeMarkdown(detail.title)}`,
		`**Type:** ${escapeMarkdown(detail.type)}`,
		`**Vault:** ${escapeMarkdown(detail.vaultName)}`,
	];
	if (detail.username)
		lines.push(`**Username:** ${escapeMarkdown(detail.username)}`);
	if (detail.email) lines.push(`**Email:** ${escapeMarkdown(detail.email)}`);
	if (detail.password) lines.push(`**Password:** ${mask(detail.password)}`);
	if (detail.urls?.length)
		lines.push(
			`\n**URLs:**\n${detail.urls.map((url) => `- ${escapeMarkdown(url)}`).join("\n")}`,
		);
	if (detail.note) lines.push(`\n**Note:**\n${escapeMarkdown(detail.note)}`);
	if (detail.customFields?.length) {
		lines.push(
			`\n**Custom fields:**\n${detail.customFields.map((field) => `- **${escapeMarkdown(field.name)}:** ${field.type === "hidden" ? mask(field.value) : escapeMarkdown(field.value)}`).join("\n")}`,
		);
	}
	if (detail.hasTotp) {
		lines.push(
			`\n**2FA:** ${currentTotp ?? "Refreshing…"}\n**Expires in:** ${remaining}s`,
		);
	}

	return (
		<Detail
			navigationTitle={detail.title}
			markdown={lines.join("\n\n")}
			metadata={
				<Detail.Metadata>
					<Detail.Metadata.Label
						title="Type"
						text={detail.type}
						icon={itemIcon(detail)}
					/>
					<Detail.Metadata.Label title="Vault" text={detail.vaultName} />
					{detail.username && (
						<Detail.Metadata.Label title="Username" text={detail.username} />
					)}
					{detail.email && (
						<Detail.Metadata.Label title="Email" text={detail.email} />
					)}
					{detail.hasTotp && (
						<>
							<Detail.Metadata.Label
								title="TOTP"
								text={
									currentTotp
										? { value: currentTotp, color: totpTimerColor(remaining) }
										: refreshing
											? "Refreshing…"
											: "Unavailable"
								}
								icon={Icon.Clock}
							/>
							<Detail.Metadata.Label
								title="Expires in"
								text={`${remaining}s`}
							/>
						</>
					)}
				</Detail.Metadata>
			}
			actions={
				<ActionPanel>
					{detail.username && (
						<Action
							title="Copy Username"
							icon={Icon.Person}
							onAction={() =>
								void safely(() => copySecret("Username", detail.username ?? ""))
							}
						/>
					)}
					{detail.email && (
						<Action
							title="Copy Email"
							icon={Icon.Envelope}
							onAction={() =>
								void safely(() => copySecret("Email", detail.email ?? ""))
							}
						/>
					)}
					{detail.password && (
						<Action
							title="Copy Password"
							icon={Icon.Key}
							onAction={() =>
								void safely(() =>
									copySecret("Password", detail.password ?? "", true, true),
								)
							}
						/>
					)}
					{detail.hasTotp && (
						<Action
							title="Copy TOTP Code"
							icon={Icon.Clock}
							onAction={() =>
								void safely(async () =>
									copySecret("TOTP code", await getTotp(item), true, true),
								)
							}
						/>
					)}
					{detail.hasTotp && (
						<Action
							title="Refresh TOTP Code"
							icon={Icon.ArrowClockwise}
							onAction={() => void safely(refresh)}
						/>
					)}
					{detail.note && (
						<Action
							title="Copy Note"
							icon={Icon.BlankDocument}
							onAction={() =>
								void safely(() => copySecret("Note", detail.note ?? "", true))
							}
						/>
					)}
					{detail.urls?.map((url, index) => (
						<Action.OpenInBrowser
							key={url}
							title={`Open URL ${index + 1}`}
							url={url}
							icon={Icon.Link}
						/>
					))}
					{detail.customFields?.map((field) => (
						<Action
							key={field.name}
							title={`Copy ${field.name}`}
							icon={Icon.CopyClipboard}
							onAction={() =>
								void safely(() =>
									copySecret(
										field.name,
										field.value,
										true,
										field.type === "hidden",
									),
								)
							}
						/>
					))}
				</ActionPanel>
			}
		/>
	);
}

function ItemActions({ item }: { item: PassItem }) {
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

	return (
		<ActionPanel>
			<Action.Push
				title="View Details"
				icon={Icon.Eye}
				target={<ItemDetailView item={item} />}
			/>
			{item.username && (
				<Action
					title="Copy Username"
					icon={Icon.Person}
					onAction={() =>
						void safely(() => copySecret("Username", item.username ?? ""))
					}
				/>
			)}
			{item.email && (
				<Action
					title="Copy Email"
					icon={Icon.Envelope}
					onAction={() =>
						void safely(() => copySecret("Email", item.email ?? ""))
					}
				/>
			)}
			{!item.username && !item.email && (
				<Action
					title="Find Username or Email"
					icon={Icon.Person}
					onAction={() =>
						void safely(async () => {
							const detail = await viewItem(item);
							const value = detail.username ?? detail.email;
							if (!value)
								throw new Error("This item has no username or email.");
							await copySecret(detail.username ? "Username" : "Email", value);
						})
					}
				/>
			)}
			<Action
				title="Copy Password"
				icon={Icon.Key}
				onAction={() =>
					void safely(async () => {
						const detail = await viewItem(item);
						if (!detail.password) throw new Error("This item has no password.");
						await copySecret("Password", detail.password, true, true);
					})
				}
			/>
			<Action
				title="Copy TOTP Code"
				icon={Icon.Clock}
				onAction={() =>
					void safely(async () =>
						copySecret("TOTP code", await getTotp(item), true, true),
					)
				}
			/>
		</ActionPanel>
	);
}

const VaultFilter = memo(function VaultFilter({
	vaults,
	onChange,
}: {
	vaults: Vault[];
	onChange: (value: string) => void;
}) {
	return (
		<List.Dropdown
			id="proton-pass-vault-filter"
			tooltip="Filter by vault"
			storeValue={true}
			defaultValue="all"
			onChange={onChange}
		>
			<List.Dropdown.Item title="All Vaults" value="all" icon={Icon.Globe01} />
			{vaults.map((vault) => (
				<List.Dropdown.Item
					key={vault.shareId}
					title={vault.name}
					value={vault.shareId}
					icon={Icon.Folder}
				/>
			))}
		</List.Dropdown>
	);
});

function ItemRows({ items }: { items: PassItem[] }) {
	return (
		<>
			{items.map((item) => (
				<List.Item
					key={`${item.shareId}:${item.itemId}`}
					title={item.title}
					subtitle={item.username ?? item.email ?? item.vaultName}
					keywords={[
						item.title,
						item.username ?? "",
						item.email ?? "",
						item.vaultName,
						item.type,
					]}
					icon={itemIcon(item)}
					accessories={[
						{ text: item.vaultName },
						...(item.hasTotp
							? [{ icon: Icon.Clock, tooltip: "Has TOTP" }]
							: []),
					]}
					actions={<ItemActions item={item} />}
				/>
			))}
		</>
	);
}

export default function Command() {
	const [items, setItems] = useState<PassItem[]>([]);
	const [vaults, setVaults] = useState<Vault[]>([]);
	const [selectedVault, setSelectedVault] = useState("all");
	const [error, setError] = useState<string>();
	const [loading, setLoading] = useState(true);
	const backgroundRefresh =
		getPreferenceValues<Preferences>().enableBackgroundRefresh !== false;
	const vaultFilter = useMemo(
		() => <VaultFilter vaults={vaults} onChange={setSelectedVault} />,
		[vaults],
	);

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

	const visibleItems =
		selectedVault === "all"
			? items
			: items.filter((item) => item.shareId === selectedVault);

	return (
		<List
			isLoading={loading}
			searchBarPlaceholder="Search Proton Pass items..."
			searchBarAccessory={vaultFilter}
		>
			{error ? (
				<List.EmptyView
					icon={Icon.Warning}
					title="Unable to load Proton Pass"
					description={`${error} Check that pass-cli is installed and authenticated.`}
				/>
			) : visibleItems.length === 0 && !loading ? (
				<List.EmptyView icon={Icon.Key} title="No Proton Pass items found" />
			) : (
				<ItemRows items={visibleItems} />
			)}
		</List>
	);
}
