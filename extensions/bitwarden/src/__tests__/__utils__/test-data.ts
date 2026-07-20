import type { BwItem, BwFolder } from '../../bitwarden-types';
import { ItemType } from '../../bitwarden-types';

/** Build a full BwItem with sensible defaults — no casts needed in tests */
export function makeItem(overrides: Partial<BwItem> = {}): BwItem {
  return {
    id: 'item-1',
    organizationId: null,
    folderId: null,
    type: ItemType.Login,
    name: 'Test Item',
    notes: null,
    favorite: false,
    revisionDate: '',
    creationDate: '',
    deletedDate: null,
    collectionIds: null,
    ...overrides,
  };
}

/** Build a BwFolder with sensible defaults */
export function makeFolder(overrides: Partial<BwFolder> = {}): BwFolder {
  return {
    id: 'f1',
    name: 'Work',
    ...overrides,
  };
}

/** Build several items at once */
export function makeItems(count: number, overrides?: (i: number) => Partial<BwItem>): BwItem[] {
  return Array.from({ length: count }, (_, i) => {
    const extra = overrides?.(i) ?? {};
    return makeItem({ ...extra, id: `item-${i + 1}` });
  });
}

/** Build several folders at once */
export function makeFolders(
  count: number,
  overrides?: (i: number) => Partial<BwFolder>,
): BwFolder[] {
  return Array.from({ length: count }, (_, i) => {
    const extra = overrides?.(i) ?? {};
    return makeFolder({ ...extra, id: `f${i + 1}` });
  });
}
