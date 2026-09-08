import { LocalStorage } from "@vicinae/api";
import { Item, Vault } from "./types";

// Only the item list metadata (titles, item types, vault names and IDs) is
// cached. Passwords, notes, usernames and TOTP codes are fetched per item and
// never touch disk.
const CACHE_KEY = "proton-pass-vault-cache";
const CACHE_TTL_MS = 5 * 60 * 1000;

type VaultCache = {
	savedAt: number;
	vaults: Vault[];
	items: Item[];
};

export async function readVaultCache(): Promise<VaultCache | undefined> {
	const raw = await LocalStorage.getItem(CACHE_KEY);
	if (typeof raw !== "string") return undefined;

	try {
		const parsed = JSON.parse(raw) as Partial<VaultCache>;
		if (
			typeof parsed.savedAt !== "number" ||
			!Array.isArray(parsed.vaults) ||
			!Array.isArray(parsed.items)
		) {
			return undefined;
		}
		return parsed as VaultCache;
	} catch {
		return undefined;
	}
}

export async function writeVaultCache(
	vaults: Vault[],
	items: Item[],
): Promise<void> {
	await LocalStorage.setItem(
		CACHE_KEY,
		JSON.stringify({ savedAt: Date.now(), vaults, items } satisfies VaultCache),
	);
}

export async function clearVaultCache(): Promise<void> {
	await LocalStorage.removeItem(CACHE_KEY);
}

export function isCacheFresh(cache: VaultCache): boolean {
	return Date.now() - cache.savedAt < CACHE_TTL_MS;
}
