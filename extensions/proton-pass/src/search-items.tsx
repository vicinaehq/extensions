import { Action, ActionPanel, Detail, Icon, List } from "@vicinae/api";
import type React from "react";
import { memo, useEffect, useMemo, useState } from "react";
import {
	type ActionId,
	copySecret,
	orderedActionIds,
	primaryUrl,
	roleStyle,
	SHORTCUTS,
	safely,
	vaultColor,
} from "./actions";
import { errorMessage } from "./cli-contract";
import { pasteSecret } from "./clipboard";
import {
	getTotp,
	type PassItem,
	type PassItemDetail,
	roleByShareId,
	type Vault,
	viewItem,
} from "./pass-cli";
import { useVaultSnapshot } from "./snapshot";
import {
	type TotpCodesState,
	totpItemKey,
	totpProgressIcon,
	totpTimerColor,
	useTotpCodes,
} from "./totp-state";

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

export function ItemDetailView({
	item,
	vaultRole,
}: {
	item: PassItem;
	vaultRole?: string;
}) {
	const [detail, setDetail] = useState<PassItemDetail>();
	const [error, setError] = useState<string>();
	const totpItems = useMemo(() => (item.hasTotp ? [item] : []), [item]);
	const { codes, remaining, refreshing, refreshError, refresh } =
		useTotpCodes(totpItems);
	const currentTotp = codes[totpItemKey(item)];

	useEffect(() => {
		let active = true;
		void viewItem(item)
			.then((nextDetail) => {
				if (active) setDetail(nextDetail);
			})
			.catch((reason: unknown) => active && setError(errorMessage(reason)));
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

	const identity = detail.username ?? detail.email;
	const identityTitle = detail.username ? "Username" : "Email";
	const currentTotpText = currentTotp
		? { value: currentTotp, color: totpTimerColor(remaining) }
		: refreshError
			? "Unavailable"
			: refreshing
				? "Refreshing…"
				: "Unavailable";
	const markdownLines = [`# ${escapeMarkdown(detail.title)}`];
	if (identity)
		markdownLines.push(`**${identityTitle}:** ${escapeMarkdown(identity)}`);
	if (detail.password)
		markdownLines.push(`**Password:** ${mask(detail.password)}`);
	if (detail.urls?.length) {
		markdownLines.push(
			`**Websites:**\n\n${detail.urls.map((url, index) => `${index + 1}. ${escapeMarkdown(url)}`).join("\n")}`,
		);
	}

	return (
		<Detail
			navigationTitle={detail.title}
			markdown={markdownLines.join("\n\n")}
			metadata={
				<Detail.Metadata>
					<Detail.Metadata.Label title="Note" text={detail.note ?? "—"} />
					<Detail.Metadata.Separator />
					{detail.hasTotp && (
						<>
							<Detail.Metadata.Label
								title="2FA Code"
								text={
									currentTotp
										? {
												value: currentTotp,
												color: totpTimerColor(remaining),
											}
										: currentTotpText
								}
							/>
							<Detail.Metadata.Label
								title="Expires in"
								text={`${remaining}s`}
							/>
						</>
					)}
					<Detail.Metadata.Label
						title="Vault"
						text={{
							value: detail.vaultName,
							color: vaultColor(vaultRole, detail.vaultName),
						}}
					/>
					<Detail.Metadata.Label
						title="Type"
						text={detail.type}
						icon={itemIcon(detail)}
					/>
					{detail.fields?.map((field) => (
						<Detail.Metadata.Label
							key={`field-${field.title}`}
							title={field.title}
							text={field.hidden ? mask(field.value) : field.value}
						/>
					))}
					{detail.customFields?.map((field) => (
						<Detail.Metadata.Label
							key={`custom-${field.name}`}
							title={field.name}
							text={field.type === "hidden" ? mask(field.value) : field.value}
						/>
					))}
				</Detail.Metadata>
			}
			actions={
				<ItemActions
					item={item}
					vaultRole={vaultRole}
					detail={detail}
					onRefreshTotp={refresh}
				/>
			}
		/>
	);
}

function ItemActions({
	item,
	vaultRole,
	detail,
	onRefreshTotp,
}: {
	item: PassItem;
	vaultRole?: string;
	detail?: PassItemDetail;
	onRefreshTotp?: () => Promise<void>;
}) {
	const username = detail?.username ?? item.username;
	const email = detail?.email ?? item.email;
	const identity = username ?? email;
	const identityTitle = username ? "Username" : "Email";
	const hasIdentity = Boolean(identity);
	const isLogin = item.type === "login";
	const passwordAvailable =
		isLogin && (detail ? Boolean(detail.password) : item.hasPassword === true);
	const url = primaryUrl(detail?.urls ?? item.urls);
	const available: ActionId[] = [];
	if (passwordAvailable) available.push("paste-password");
	if (hasIdentity) available.push("paste-username");
	if (!detail) available.push("view-details");
	if (passwordAvailable) available.push("copy-password");
	if (hasIdentity) available.push("copy-username");
	if (item.hasTotp) available.push("paste-totp", "copy-totp");
	if (url && !detail) available.push("open-browser");

	const render: Record<ActionId, React.ReactNode> = {
		"view-details": (
			<Action.Push
				key="view-details"
				title="View Details"
				icon={Icon.Eye}
				shortcut={SHORTCUTS.viewDetails}
				target={<ItemDetailView item={item} vaultRole={vaultRole} />}
			/>
		),
		"paste-password": (
			<Action
				key="paste-password"
				title="Paste Password"
				icon={Icon.Key}
				shortcut={{ modifiers: [], key: "return" }}
				onAction={() =>
					void safely(async () => {
						const loaded =
							detail ?? (item.password ? item : await viewItem(item));
						if (!loaded.password) throw new Error("This item has no password.");
						await pasteSecret(loaded.password);
					})
				}
			/>
		),
		"paste-username": (
			<Action
				key="paste-username"
				title={`Paste ${identityTitle}`}
				icon={username ? Icon.Person : Icon.Envelope}
				shortcut={{ modifiers: ["shift"], key: "return" }}
				onAction={() => void safely(() => pasteSecret(identity ?? ""))}
			/>
		),
		"copy-password": (
			<Action
				key="copy-password"
				title="Copy Password"
				icon={Icon.Key}
				shortcut={SHORTCUTS.copyPassword}
				onAction={() =>
					void safely(async () => {
						const loaded =
							detail ?? (item.password ? item : await viewItem(item));
						if (!loaded.password) throw new Error("This item has no password.");
						await copySecret("Password", loaded.password, { sensitive: true });
					})
				}
			/>
		),
		"copy-username": (
			<Action
				key="copy-username"
				title={`Copy ${identityTitle}`}
				icon={username ? Icon.Person : Icon.Envelope}
				shortcut={SHORTCUTS.copyUsername}
				onAction={() =>
					void safely(() => copySecret(identityTitle, identity ?? ""))
				}
			/>
		),
		"paste-totp": (
			<Action
				key="paste-totp"
				title="Paste TOTP Code"
				icon={Icon.Clock}
				shortcut={SHORTCUTS.pasteTotp}
				onAction={() =>
					void safely(async () => pasteSecret(await getTotp(item)))
				}
			/>
		),
		"copy-totp": (
			<Action
				key="copy-totp"
				title="Copy TOTP Code"
				icon={Icon.Clock}
				shortcut={SHORTCUTS.copyTotp}
				onAction={() =>
					void safely(async () =>
						copySecret("TOTP code", await getTotp(item), { sensitive: true }),
					)
				}
			/>
		),
		"open-browser": url ? (
			<Action.OpenInBrowser
				key="open-browser"
				title="Open in Browser"
				icon={Icon.Link}
				shortcut={SHORTCUTS.openInBrowser}
				url={url}
			/>
		) : null,
	};

	const ordered = isLogin
		? [
				...available.filter((id) =>
					["paste-password", "paste-username"].includes(id),
				),
				...available.filter(
					(id) => !["paste-password", "paste-username"].includes(id),
				),
			]
		: orderedActionIds(available);
	const primary = ordered.slice(0, 2);
	const rest = ordered.slice(2);
	const credentials = rest.filter((id) =>
		["copy-password", "copy-username"].includes(id),
	);
	const details = rest.filter((id) => id === "view-details");
	const totp = rest.filter((id) => ["paste-totp", "copy-totp"].includes(id));
	const utility = rest.filter((id) => id === "open-browser");
	const renderSection = (ids: ActionId[]) => ids.map((id) => render[id]);

	const findFallback =
		!hasIdentity && !detail ? (
			<Action
				key="find-identity"
				title="Find Username or Email"
				icon={Icon.Person}
				onAction={() =>
					void safely(async () => {
						const loaded = await viewItem(item);
						const value = loaded.username ?? loaded.email;
						if (!value) throw new Error("This item has no username or email.");
						await copySecret(loaded.username ? "Username" : "Email", value);
					})
				}
			/>
		) : null;

	const additional = detail ? (
		<ActionPanel.Section title="Additional">
			{detail.note && (
				<Action
					key="copy-note"
					title="Copy Note"
					icon={Icon.BlankDocument}
					shortcut={{ modifiers: ["ctrl", "shift"], key: "n" }}
					onAction={() =>
						void safely(() =>
							copySecret("Note", detail.note ?? "", { concealed: true }),
						)
					}
				/>
			)}
			{detail.urls?.map((entry, index) => (
				<Action.OpenInBrowser
					key={`url-${entry}`}
					title={`Open URL ${index + 1}`}
					url={entry}
					icon={Icon.Link}
					shortcut={index === 0 ? SHORTCUTS.openInBrowser : undefined}
				/>
			))}
			{detail.customFields?.map((field) => (
				<Action
					key={`custom-${field.name}`}
					title={`Copy ${field.name}`}
					icon={Icon.CopyClipboard}
					onAction={() =>
						void safely(() =>
							copySecret(field.name, field.value, {
								concealed: true,
								sensitive: field.type === "hidden",
							}),
						)
					}
				/>
			))}
			{detail.fields?.map((field) =>
				field.copy ? (
					<Action
						key={`field-${field.title}`}
						title={`Copy ${field.title}`}
						icon={Icon.CopyClipboard}
						shortcut={
							field.title === "Expiry date" ? SHORTCUTS.copyExpiry : undefined
						}
						onAction={() =>
							void safely(() =>
								copySecret(field.title, field.value, {
									concealed: true,
									sensitive: field.hidden,
								}),
							)
						}
					/>
				) : null,
			)}
		</ActionPanel.Section>
	) : null;

	return (
		<ActionPanel>
			{primary.length > 0 && (
				<ActionPanel.Section title="Primary">
					{renderSection(primary)}
				</ActionPanel.Section>
			)}
			{details.length > 0 && (
				<ActionPanel.Section title="Details">
					{renderSection(details)}
				</ActionPanel.Section>
			)}
			{credentials.length > 0 && (
				<ActionPanel.Section title="Credentials">
					{renderSection(credentials)}
				</ActionPanel.Section>
			)}
			{totp.length > 0 && (
				<ActionPanel.Section title="TOTP">
					{renderSection(totp)}
					{detail && onRefreshTotp && (
						<Action
							title="Refresh TOTP Code"
							icon={Icon.ArrowClockwise}
							shortcut={SHORTCUTS.refresh}
							onAction={() => void safely(onRefreshTotp)}
						/>
					)}
				</ActionPanel.Section>
			)}
			{additional}
			{utility.length > 0 || findFallback ? (
				<ActionPanel.Section>
					{renderSection(utility)}
					{findFallback}
				</ActionPanel.Section>
			) : null}
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
					icon={{
						source: roleStyle(vault.role).icon,
						tintColor: vaultColor(vault.role, vault.name),
					}}
				/>
			))}
		</List.Dropdown>
	);
});

// Item types as exposed by the item list, with friendly labels and icons.
const ITEM_TYPES: Array<{ value: string; title: string; icon: Icon }> = [
	{ value: "login", title: "Logins", icon: Icon.Key },
	{ value: "note", title: "Notes", icon: Icon.BlankDocument },
	{ value: "credit_card", title: "Credit Cards", icon: Icon.CreditCard },
	{ value: "identity", title: "Identities", icon: Icon.PersonCircle },
	{ value: "alias", title: "Aliases", icon: Icon.Link },
	{ value: "ssh_key", title: "SSH Keys", icon: Icon.Key },
	{ value: "wifi", title: "Wi-Fi", icon: Icon.Wifi },
	{ value: "custom", title: "Custom", icon: Icon.BlankDocument },
];

const TypeFilter = memo(function TypeFilter({
	onChange,
}: {
	onChange: (value: string) => void;
}) {
	return (
		<List.Dropdown
			id="proton-pass-type-filter"
			tooltip="Filter by type"
			storeValue={true}
			defaultValue="all"
			onChange={onChange}
		>
			<List.Dropdown.Item title="All Types" value="all" icon={Icon.Globe01} />
			{ITEM_TYPES.map((type) => (
				<List.Dropdown.Item
					key={type.value}
					title={type.title}
					value={type.value}
					icon={type.icon}
				/>
			))}
		</List.Dropdown>
	);
});

export function ItemRows({
	items,
	vaults,
	totpState,
}: {
	items: PassItem[];
	vaults: Vault[];
	totpState?: TotpCodesState;
}) {
	const roleMap = roleByShareId(vaults);
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
						...(item.urls ?? []),
					]}
					icon={{
						source: itemIcon(item),
						tintColor: vaultColor(roleMap.get(item.shareId), item.vaultName),
					}}
					accessories={[
						{
							tag: {
								value: item.vaultName,
								color: vaultColor(roleMap.get(item.shareId), item.vaultName),
							},
							icon: roleStyle(roleMap.get(item.shareId)).icon,
							tooltip: `Role: ${roleMap.get(item.shareId) ?? "unknown"}`,
						},
						...(item.hasTotp
							? totpState
								? [
										{
											tag: {
												value: totpState.codes[totpItemKey(item)] ?? "---",
												color: totpTimerColor(totpState.remaining),
											},
										},
										{
											icon: totpProgressIcon(totpState.remaining),
											tooltip: `TOTP expires in ${totpState.remaining}s`,
										},
									]
								: [{ icon: Icon.Clock, tooltip: "Has TOTP" }]
							: []),
					]}
					actions={
						<ItemActions item={item} vaultRole={roleMap.get(item.shareId)} />
					}
				/>
			))}
		</>
	);
}

export default function Command() {
	const { vaults, items, loading, error } = useVaultSnapshot();
	const [selectedVault, setSelectedVault] = useState("all");
	const [selectedType, setSelectedType] = useState("all");
	const filterAccessory = useMemo(
		() => (
			<>
				<VaultFilter vaults={vaults} onChange={setSelectedVault} />
				<TypeFilter onChange={setSelectedType} />
			</>
		),
		[vaults],
	);

	const visibleItems = items.filter(
		(item) =>
			(selectedVault === "all" || item.shareId === selectedVault) &&
			(selectedType === "all" || item.type === selectedType),
	);

	return (
		<List
			isLoading={loading}
			searchBarPlaceholder="Search Proton Pass items..."
			searchBarAccessory={filterAccessory}
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
				<ItemRows items={visibleItems} vaults={vaults} />
			)}
		</List>
	);
}
