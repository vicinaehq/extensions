import { getPreferenceValues, LocalStorage } from "@vicinae/api";
import type { PassItem, Vault } from "./pass-cli";

const CACHE_PREFIX = "proton_pass_vicinae_v3_";
const SNAPSHOT_KEY = `${CACHE_PREFIX}snapshot`;
const VAULTS_KEY = `${CACHE_PREFIX}vaults`;
const VAULT_ITEMS_PREFIX = `${CACHE_PREFIX}vault_items_`;
const DEFAULT_TTL_MS = 5 * 60 * 1000;
let cacheEpoch = 0;

type CachePreferences = {
	cacheExpiration?: string;
};

type Cached<T> = {
	timestamp: number;
	data: T;
};

export type CacheEntry<T> = {
	data: T;
	isStale: boolean;
};

export type MetadataSnapshot = {
	vaults: Vault[];
	items: PassItem[];
};

function ttlMs(): number {
	const minutes = Number(
		getPreferenceValues<CachePreferences>().cacheExpiration,
	);
	return Number.isFinite(minutes) && minutes > 0
		? minutes * 60 * 1000
		: DEFAULT_TTL_MS;
}

async function get<T>(key: string): Promise<CacheEntry<T> | undefined> {
	try {
		const raw = await LocalStorage.getItem<string>(key);
		if (!raw) return undefined;
		const cached = JSON.parse(raw) as Cached<T>;
		if (
			!cached ||
			typeof cached.timestamp !== "number" ||
			cached.data === undefined
		)
			return undefined;
		return {
			data: cached.data,
			isStale: Date.now() - cached.timestamp >= ttlMs(),
		};
	} catch {
		return undefined;
	}
}

export function currentCacheEpoch(): number {
	return cacheEpoch;
}

async function set<T>(key: string, data: T, epoch = cacheEpoch): Promise<void> {
	if (epoch !== cacheEpoch) return;
	const cached: Cached<T> = { timestamp: Date.now(), data };
	await LocalStorage.setItem(key, JSON.stringify(cached));
	if (epoch !== cacheEpoch) await LocalStorage.removeItem(key);
}

export const getCachedSnapshot = (): Promise<
	CacheEntry<MetadataSnapshot> | undefined
> => get(SNAPSHOT_KEY);
export const setCachedSnapshot = (
	snapshot: MetadataSnapshot,
	epoch?: number,
): Promise<void> => set(SNAPSHOT_KEY, snapshot, epoch);
export const getCachedVaults = (): Promise<CacheEntry<Vault[]> | undefined> =>
	get(VAULTS_KEY);
export const setCachedVaults = (
	vaults: Vault[],
	epoch?: number,
): Promise<void> => set(VAULTS_KEY, vaults, epoch);

function vaultItemsKey(shareId: string): string {
	return `${VAULT_ITEMS_PREFIX}${encodeURIComponent(shareId)}`;
}

export const getCachedVaultItems = (
	shareId: string,
): Promise<CacheEntry<PassItem[]> | undefined> => get(vaultItemsKey(shareId));
export const setCachedVaultItems = (
	shareId: string,
	items: PassItem[],
	epoch?: number,
): Promise<void> => set(vaultItemsKey(shareId), items, epoch);

export async function clearCache(): Promise<void> {
	cacheEpoch += 1;
	const entries = await LocalStorage.allItems();
	await Promise.all(
		Object.keys(entries)
			// Match any cache generation (v1, v2, ...) so old keys are purged.
			.filter((key) => key.startsWith("proton_pass_vicinae"))
			.map((key) => LocalStorage.removeItem(key)),
	);
}
