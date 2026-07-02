import { BwItem, ItemType } from './bitwarden-types';

export function filterItems(items: BwItem[], query: string): BwItem[] {
  if (!query.trim()) return items;
  const lower = query.toLowerCase();
  return items.filter((item) => item.name.toLowerCase().includes(lower));
}

type GroupedItems = Map<string | null, { folderName: string; items: BwItem[] }>;

export function groupByFolder(
  items: BwItem[],
  folders: { id: string; name: string }[],
): GroupedItems {
  const folderMap = new Map<string, string>();
  for (const f of folders) {
    folderMap.set(f.id, f.name);
  }

  const grouped: GroupedItems = new Map();

  for (const item of items) {
    const key = item.folderId ?? null;
    if (!grouped.has(key)) {
      grouped.set(key, {
        folderName: key ? (folderMap.get(key) ?? 'Unknown') : 'Unfiled',
        items: [],
      });
    }
    grouped.get(key)!.items.push(item);
  }

  return grouped;
}

export function itemSubtitle(item: BwItem): string | undefined {
  switch (item.type) {
    case ItemType.Login:
      return item.login?.username ?? undefined;
    case ItemType.Card:
      if (item.card?.cardholderName) return item.card.cardholderName;
      if (item.card?.brand && item.card.number) {
        return `${item.card.brand} *${item.card.number.slice(-4)}`;
      }
      return undefined;
    case ItemType.Identity: {
      const identity = item.identity;
      if (!identity) return undefined;
      const parts = [identity.firstName, identity.lastName].filter(Boolean);
      return parts.length > 0 ? parts.join(' ') : undefined;
    }
    case ItemType.SecureNote:
      return undefined;
    default:
      return undefined;
  }
}

export function itemTypeLabel(item: BwItem): string {
  switch (item.type) {
    case ItemType.Login:
      return 'Login';
    case ItemType.Card:
      return 'Card';
    case ItemType.Identity:
      return 'Identity';
    case ItemType.SecureNote:
      return 'Secure Note';
    default:
      return 'Unknown';
  }
}

export function formatTotp(code: string): string {
  const mid = Math.floor(code.length / 2);
  return `${code.slice(0, mid)} ${code.slice(mid)}`;
}

export function hasTotp(item: BwItem): boolean {
  return item.type === ItemType.Login && item.login?.totp != null;
}
