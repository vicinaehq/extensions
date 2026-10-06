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

	return (
		<Detail
			navigationTitle={detail.title}
			markdown=""
			metadata={
				<Detail.Metadata>
					<Detail.Metadata.Label
						title="Item"
						text={detail.title}
						icon={itemIcon(detail)}
					/>
					<Detail.Metadata.Label title="Note" text={detail.note ?? "—"} />
					<Detail.Metadata.Separator />
					{detail.username && (
						<Detail.Metadata.Label title="Username" text={detail.username} />
					)}
					{detail.email && (
						<Detail.Metadata.Label title="Email" text={detail.email} />
					)}
					{detail.password && (
						<Detail.Metadata.Label
							title="Password"
							text={mask(detail.password)}
							icon={Icon.Key}
						/>
					)}
					{detail.fields?.map((field) => (
						<Detail.Metadata.Label
							key={field.title}
							title={field.title}
							text={field.hidden ? mask(field.value) : field.value}
						/>
					))}
					{detail.urls?.map((url, index) => (
						<Detail.Metadata.Link
							key={`url-${url}`}
							title={index === 0 ? "Website" : `Website ${index + 1}`}
							target={url}
							text={url}
						/>
					))}
					{detail.hasTotp && (
						<>
							<Detail.Metadata.Label
								title="TOTP"
								text={
									currentTotp
										? { value: currentTotp, color: totpTimerColor(remaining) }
										: refreshError
											? "Unavailable"
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
					<Detail.Metadata.Separator />
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
				<ActionPanel>
					<ActionPanel.Section title="Credentials">
						{detail.password && (
							<Action
								title="Copy Password"
								icon={Icon.Key}
								shortcut={SHORTCUTS.copyPassword}
								onAction={() =>
									void safely(() =>
										copySecret("Password", detail.password ?? "", {
											sensitive: true,
										}),
									)
								}
							/>
						)}
						{detail.password && (
							<Action
								title="Paste Password"
								icon={Icon.Key}
								onAction={() =>
									void safely(() => pasteSecret(detail.password ?? ""))
								}
							/>
						)}
						{detail.username && (
							<Action
								title="Copy Username"
								icon={Icon.Person}
								shortcut={SHORTCUTS.copyUsername}
								onAction={() =>
									void safely(() =>
										copySecret("Username", detail.username ?? ""),
									)
								}
							/>
						)}
						{detail.username && (
							<Action
								title="Paste Username"
								icon={Icon.Person}
								onAction={() =>
									void safely(() => pasteSecret(detail.username ?? ""))
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
						{detail.email && (
							<Action
								title="Paste Email"
								icon={Icon.Envelope}
								onAction={() =>
									void safely(() => pasteSecret(detail.email ?? ""))
								}
							/>
						)}
					</ActionPanel.Section>
					<ActionPanel.Section title="TOTP">
						{detail.hasTotp && (
							<Action
								title="Copy TOTP Code"
								icon={Icon.Clock}
								shortcut={SHORTCUTS.copyTotp}
								onAction={() =>
									void safely(async () =>
										copySecret("TOTP code", await getTotp(item), {
											sensitive: true,
										}),
									)
								}
							/>
						)}
						{detail.hasTotp && (
							<Action
								title="Paste TOTP Code"
								icon={Icon.Clock}
								shortcut={SHORTCUTS.pasteTotp}
								onAction={() =>
									void safely(async () => pasteSecret(await getTotp(item)))
								}
							/>
						)}
						{detail.hasTotp && (
							<Action
								title="Refresh TOTP Code"
								icon={Icon.ArrowClockwise}
								shortcut={SHORTCUTS.refresh}
								onAction={() => void safely(refresh)}
							/>
						)}
					</ActionPanel.Section>
					<ActionPanel.Section title="Additional">
						{detail.note && (
							<Action
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
						{detail.urls?.map((url, index) => (
							<Action.OpenInBrowser
								key={url}
								title={`Open URL ${index + 1}`}
								url={url}
								icon={Icon.Link}
								shortcut={index === 0 ? SHORTCUTS.openInBrowser : undefined}
							/>
						))}
						{detail.customFields?.map((field) => (
							<Action
								key={field.name}
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
									key={`copy-${field.title}`}
									title={`Copy ${field.title}`}
									icon={Icon.CopyClipboard}
									shortcut={
										field.title === "Expiry date"
											? SHORTCUTS.copyExpiry
											: undefined
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
				</ActionPanel>
			}
		/>
	);
}

function ItemActions({
	item,
	vaultRole,
}: {
	item: PassItem;
	vaultRole?: string;
}) {
	const hasIdentity = Boolean(item.username || item.email);
	const url = primaryUrl(item.urls);

	// Login rows reserve Paste Password and Paste Username/Email as the first
	// two actions. Paste Password resolves the secret lazily, so an incomplete
	// metadata snapshot must never hide the action itself.
	const isLogin = item.type === "login";
	const available: ActionId[] = [];
	if (isLogin) available.push("paste-password");
	if (hasIdentity) available.push("paste-username");
	available.push("view-details");
	if (isLogin) available.push("copy-password");
	if (hasIdentity) available.push("copy-username");
	if (item.hasTotp) available.push("copy-totp", "paste-totp");
	if (url) available.push("open-browser");

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
		"copy-username": (
			<Action
				key="copy-username"
				title={item.username ? "Copy Username" : "Copy Email"}
				icon={item.username ? Icon.Person : Icon.Envelope}
				shortcut={SHORTCUTS.copyUsername}
				onAction={() =>
					void safely(() =>
						copySecret(
							item.username ? "Username" : "Email",
							item.username ?? item.email ?? "",
						),
					)
				}
			/>
		),
		"paste-username": (
			<Action
				key="paste-username"
				title={item.username ? "Paste Username" : "Paste Email"}
				icon={item.username ? Icon.Person : Icon.Envelope}
				onAction={() =>
					void safely(() => pasteSecret(item.username ?? item.email ?? ""))
				}
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
						const detail = await viewItem(item);
						if (!detail.password) throw new Error("This item has no password.");
						await copySecret("Password", detail.password, { sensitive: true });
					})
				}
			/>
		),
		"paste-password": (
			<Action
				key="paste-password"
				title="Paste Password"
				icon={Icon.Key}
				onAction={() =>
					void safely(async () => {
						const detail = await viewItem(item);
						if (!detail.password) throw new Error("This item has no password.");
						await pasteSecret(detail.password);
					})
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

	const preferredLoginActions: ActionId[] = [];
	if (isLogin) {
		preferredLoginActions.push("paste-password");
		if (hasIdentity) preferredLoginActions.push("paste-username");
	}
	const ordered = isLogin
		? [
				...preferredLoginActions,
				...available.filter((id) => !preferredLoginActions.includes(id)),
			]
		: orderedActionIds(available);
	const primary = ordered.slice(0, 2);
	const rest = ordered.slice(2);
	const details = rest.filter((id) => id === "view-details");
	const credentials = rest.filter((id) =>
		[
			"copy-username",
			"paste-username",
			"copy-password",
			"paste-password",
		].includes(id),
	);
	const totp = rest.filter((id) => ["copy-totp", "paste-totp"].includes(id));
	const utility = rest.filter((id) => id === "open-browser");
	const renderSection = (ids: ActionId[]) => ids.map((id) => render[id]);

	const findFallback = !hasIdentity ? (
		<Action
			key="find-identity"
			title="Find Username or Email"
			icon={Icon.Person}
			onAction={() =>
				void safely(async () => {
					const detail = await viewItem(item);
					const value = detail.username ?? detail.email;
					if (!value) throw new Error("This item has no username or email.");
					await copySecret(detail.username ? "Username" : "Email", value);
				})
			}
		/>
	) : null;

	return (
		<ActionPanel>
			<ActionPanel.Section title="Primary">
				{renderSection(primary)}
			</ActionPanel.Section>
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
				</ActionPanel.Section>
			)}
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
