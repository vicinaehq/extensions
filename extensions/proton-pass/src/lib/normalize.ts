import {
	CustomField,
	Item,
	ItemDetail,
	ItemType,
	PassCliError,
	Vault,
} from "./types";

function trimOrUndefined(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function invalid(context: string): PassCliError {
	return new PassCliError(
		`Unexpected ${context} output from pass-cli.`,
		"invalid_output",
	);
}

export function normalizeVault(raw: unknown): Vault {
	if (!isRecord(raw)) throw invalid("vault list");

	const shareId = trimOrUndefined(
		raw.share_id ?? raw.shareId ?? raw.shareID ?? raw.id,
	);
	const name = trimOrUndefined(raw.name);
	if (!shareId || !name) throw invalid("vault list");

	return { shareId, name };
}

function normalizeItemType(value: unknown): ItemType {
	switch (trimOrUndefined(value)?.toLowerCase()) {
		case "login":
			return "login";
		case "note":
			return "note";
		case "credit_card":
			return "credit_card";
		case "identity":
			return "identity";
		case "alias":
			return "alias";
		case "ssh_key":
			return "ssh_key";
		case "wifi":
			return "wifi";
		default:
			return "note";
	}
}

export function normalizeItem(raw: unknown, vaultName: string): Item {
	if (!isRecord(raw)) throw invalid("item list");

	const shareId = trimOrUndefined(
		raw.share_id ?? raw.shareId ?? raw.vault_share_id,
	);
	const itemId = trimOrUndefined(raw.id ?? raw.itemId ?? raw.item_id);
	const title = trimOrUndefined(raw.title ?? raw.name);
	if (!shareId || !itemId || !title) throw invalid("item list");

	return {
		shareId,
		itemId,
		title,
		type: normalizeItemType(raw.item_type ?? raw.itemType),
		vaultName,
	};
}

const TYPE_KEYS = [
	"Login",
	"Note",
	"CreditCard",
	"credit_card",
	"Identity",
	"Alias",
	"SshKey",
	"ssh_key",
	"Wifi",
] as const;

function getTypeData(outer: Record<string, unknown>): {
	type: ItemType;
	data: Record<string, unknown> | undefined;
} {
	const inner = isRecord(outer.content) ? outer.content : undefined;
	if (!inner) return { type: "note", data: undefined };

	for (const key of TYPE_KEYS) {
		if (isRecord(inner[key])) {
			return { type: normalizeItemType(key), data: inner[key] };
		}
	}
	return { type: "note", data: undefined };
}

function normalizeUrls(raw: unknown): string[] | undefined {
	if (!Array.isArray(raw)) return undefined;

	const urls = raw
		.map((entry) => {
			if (typeof entry === "string") return trimOrUndefined(entry);
			if (!isRecord(entry)) return undefined;
			return trimOrUndefined(
				entry.url ?? entry.href ?? entry.value ?? entry.link,
			);
		})
		.filter((value): value is string => value !== undefined);

	return urls.length > 0 ? urls : undefined;
}

function normalizeCustomFields(raw: unknown): CustomField[] | undefined {
	if (!Array.isArray(raw)) return undefined;

	const fields = raw
		.map((field) => {
			if (!isRecord(field)) return undefined;
			const name = trimOrUndefined(field.name ?? field.key);
			const content = isRecord(field.content) ? field.content : undefined;
			const value = content
				? trimOrUndefined(content.Text ?? content.Hidden)
				: trimOrUndefined(field.value);
			const hidden = content
				? content.Hidden !== undefined
				: trimOrUndefined(field.type)?.toLowerCase() === "hidden";
			if (!name || value === undefined) return undefined;
			return { name, value, hidden } satisfies CustomField;
		})
		.filter((field): field is CustomField => field !== undefined);

	return fields.length > 0 ? fields : undefined;
}

export function normalizeItemDetail(
	raw: unknown,
	vaultName: string,
): ItemDetail {
	// `item view --output json` wraps the item in an `item` key.
	const record = isRecord(raw) && isRecord(raw.item) ? raw.item : raw;
	if (!isRecord(record)) throw invalid("item view");

	const shareId = trimOrUndefined(record.share_id ?? record.shareId);
	const itemId = trimOrUndefined(record.id ?? record.itemId ?? record.item_id);
	if (!shareId || !itemId) throw invalid("item view");

	const outer = isRecord(record.content) ? record.content : record;
	const title = trimOrUndefined(outer.title ?? record.title ?? record.name);
	if (!title) throw invalid("item view");

	const { type, data } = getTypeData(outer);
	const username = trimOrUndefined(data?.username);
	const email = trimOrUndefined(data?.email);
	const password = trimOrUndefined(data?.password);
	const urls = normalizeUrls(data?.urls);
	const totpUri = trimOrUndefined(data?.totp_uri ?? data?.totpUri);
	const note = trimOrUndefined(outer.note);
	const customFields =
		normalizeCustomFields(outer.extra_fields) ??
		normalizeCustomFields(outer.extraFields);

	return {
		shareId,
		itemId,
		title,
		type,
		vaultName,
		username,
		email,
		password,
		urls,
		note,
		customFields,
		hasTotp: totpUri !== undefined,
	};
}
