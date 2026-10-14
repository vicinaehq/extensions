import {
	Action,
	ActionPanel,
	Clipboard,
	Detail,
	Icon,
	showToast,
	Toast,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { getItem, getTotp } from "../lib/pass-cli";
import { Item, ItemDetail, PassCliError } from "../lib/types";
import { getItemIcon, maskPassword } from "../lib/utils";

function escapeMarkdown(value: string): string {
	return value.replace(/([\\`*_{}[\]()#+\-.!|>])/g, "\\$1");
}

async function copySecret(
	title: string,
	value: string,
	concealed = true,
): Promise<void> {
	await Clipboard.copy(value, { concealed });
	await showToast(Toast.Style.Success, `Copied ${title}`);
}

async function toastError(title: string, error: unknown): Promise<void> {
	await showToast(
		Toast.Style.Failure,
		title,
		error instanceof PassCliError ? error.message : undefined,
	);
}

export default function ItemDetailView({ item }: { item: Item }) {
	const [detail, setDetail] = useState<ItemDetail | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		(async () => {
			try {
				const loaded = await getItem(item);
				if (!cancelled) setDetail(loaded);
			} catch (e) {
				if (!cancelled) {
					setError(
						e instanceof Error ? e.message : "Failed to load item details",
					);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [item]);

	if (error) {
		return <Detail markdown={`# Error\n\n${escapeMarkdown(error)}`} />;
	}

	if (!detail) {
		return <Detail markdown="Loading..." />;
	}

	const markdownParts: string[] = [];

	markdownParts.push(`# ${escapeMarkdown(detail.title)}\n`);
	markdownParts.push(`**Type:** ${escapeMarkdown(detail.type)}`);
	markdownParts.push(`**Vault:** ${escapeMarkdown(detail.vaultName)}\n`);

	if (detail.username) {
		markdownParts.push(`**Username:** ${escapeMarkdown(detail.username)}`);
	}

	if (detail.email) {
		markdownParts.push(`**Email:** ${escapeMarkdown(detail.email)}`);
	}

	if (detail.password) {
		markdownParts.push(
			`**Password:** \`${escapeMarkdown(maskPassword(detail.password))}\``,
		);
	}

	if (detail.urls && detail.urls.length > 0) {
		markdownParts.push(`\n**URLs:**`);
		for (const url of detail.urls) {
			markdownParts.push(`- ${escapeMarkdown(url)}`);
		}
	}

	if (detail.note) {
		markdownParts.push(`\n**Note:**\n${escapeMarkdown(detail.note)}`);
	}

	if (detail.customFields && detail.customFields.length > 0) {
		markdownParts.push(`\n**Custom Fields:**`);
		for (const field of detail.customFields) {
			const value = field.hidden ? maskPassword(field.value) : field.value;
			markdownParts.push(
				`- **${escapeMarkdown(field.name)}:** ${escapeMarkdown(value)}`,
			);
		}
	}

	if (detail.hasTotp) {
		markdownParts.push(`\n**2FA:** Enabled`);
	}

	return (
		<Detail
			navigationTitle={detail.title}
			markdown={markdownParts.join("\n")}
			metadata={
				<Detail.Metadata>
					<Detail.Metadata.Label
						title="Type"
						text={detail.type}
						icon={getItemIcon(detail.type)}
					/>
					<Detail.Metadata.Label title="Vault" text={detail.vaultName} />
					{detail.username && (
						<Detail.Metadata.Label title="Username" text={detail.username} />
					)}
					{detail.email && (
						<Detail.Metadata.Label title="Email" text={detail.email} />
					)}
					{detail.hasTotp && (
						<Detail.Metadata.Label
							title="2FA"
							text="Enabled"
							icon={Icon.Clock}
						/>
					)}
				</Detail.Metadata>
			}
			actions={
				<ActionPanel>
					<ActionPanel.Section title="Copy">
						{detail.password && (
							<Action
								title="Copy Password"
								icon={Icon.Key}
								shortcut={{ modifiers: ["shift"], key: "return" }}
								onAction={() => copySecret("password", detail.password!)}
							/>
						)}
						{detail.username && (
							<Action
								title="Copy Username"
								icon={Icon.Person}
								shortcut={{ modifiers: ["cmd", "shift"], key: "u" }}
								onAction={() => copySecret("username", detail.username!)}
							/>
						)}
						{detail.email && (
							<Action
								title="Copy Email"
								icon={Icon.Envelope}
								shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
								onAction={() => copySecret("email", detail.email!)}
							/>
						)}
						{detail.hasTotp && (
							<Action
								title="Copy TOTP Code"
								icon={Icon.Clock}
								shortcut={{ modifiers: ["cmd", "shift"], key: "t" }}
								onAction={async () => {
									try {
										const totp = await getTotp(detail.shareId, detail.itemId);
										await copySecret("TOTP code", totp);
									} catch (e) {
										await toastError("Failed to get TOTP", e);
									}
								}}
							/>
						)}
						{detail.note && (
							<Action
								title="Copy Note"
								icon={Icon.BlankDocument}
								shortcut={{ modifiers: ["cmd", "shift"], key: "n" }}
								onAction={() => copySecret("note", detail.note!, false)}
							/>
						)}
					</ActionPanel.Section>

					{detail.password && (
						<ActionPanel.Section title="Paste">
							<Action
								title="Paste Password"
								icon={Icon.Text}
								onAction={async () => {
									await Clipboard.paste(detail.password!);
									await showToast(Toast.Style.Success, "Password pasted");
								}}
							/>
						</ActionPanel.Section>
					)}

					{detail.customFields && detail.customFields.length > 0 && (
						<ActionPanel.Section title="Custom Fields">
							{detail.customFields.map((field) => (
								<Action
									key={field.name}
									title={`Copy ${field.name}`}
									icon={Icon.CopyClipboard}
									onAction={() =>
										copySecret(field.name, field.value, field.hidden)
									}
								/>
							))}
						</ActionPanel.Section>
					)}

					{detail.urls && detail.urls.length > 0 && (
						<ActionPanel.Section title="URLs">
							{detail.urls.map((url) => (
								<Action.OpenInBrowser
									key={url}
									title={`Open ${url}`}
									url={url}
								/>
							))}
						</ActionPanel.Section>
					)}
				</ActionPanel>
			}
		/>
	);
}
