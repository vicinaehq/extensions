import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetItem, mockSetItem, mockRemoveItem } = vi.hoisted(() => ({
  mockGetItem: vi.fn<[key: string], Promise<string | undefined>>().mockResolvedValue(undefined),
  mockSetItem: vi.fn<[key: string, value: string], Promise<void>>().mockResolvedValue(undefined),
  mockRemoveItem: vi.fn<[key: string], Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock('@vicinae/api', () => ({
  LocalStorage: {
    getItem: (key: string) => mockGetItem(key),
    setItem: (key: string, value: string) => mockSetItem(key, value),
    removeItem: (key: string) => mockRemoveItem(key),
  },
  Image: { Mask: { Circle: 'circle', RoundedRectangle: 'roundedRectangle' } },
}));

import { BwItem, ItemType } from '../bitwarden-types';
import { CreateItemPayload, ItemAction } from '../bw-executor';
import {
  buildItemDetailMarkdown,
  clearCachedVault,
  filterItems,
  itemActions,
  groupByFolder,
  itemIcon,
  itemSubtitle,
  itemTypeLabel,
  loadCachedVault,
  saveCachedVault,
  toCreatePayload,
} from '../item-utils';
import { clearFaviconCache, loadFaviconCache, resolveFavicons } from '../favicons';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetItem.mockResolvedValue(undefined);
});

function makeItem(overrides: Partial<BwItem> = {}): BwItem {
  return {
    id: 'item-1',
    organizationId: null,
    folderId: null,
    type: ItemType.Login,
    name: 'Test Item',
    notes: null,
    favorite: false,
    revisionDate: '2024-01-01T00:00:00Z',
    creationDate: '2024-01-01T00:00:00Z',
    deletedDate: null,
    collectionIds: null,
    ...overrides,
  };
}

const folders = [
  { id: 'f1', name: 'Work' },
  { id: 'f2', name: 'Personal' },
];

// ---------------------------------------------------------------------------
// filterItems
// ---------------------------------------------------------------------------
describe('filterItems', () => {
  const items = [
    makeItem({ id: '1', name: 'GitHub' }),
    makeItem({ id: '2', name: 'gitlab' }),
    makeItem({ id: '3', name: 'Bank Account' }),
    makeItem({ id: '4', name: 'Email' }),
  ];

  it('returns all items when query is empty', () => {
    expect(filterItems(items, '')).toHaveLength(4);
  });

  it('returns all items when query is whitespace only', () => {
    expect(filterItems(items, '   ')).toHaveLength(4);
  });

  it('matches case-insensitive substring', () => {
    const result = filterItems(items, 'git');
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(['1', '2']);
  });

  it('returns empty array when nothing matches', () => {
    expect(filterItems(items, 'notfound')).toHaveLength(0);
  });

  it('matches by full name', () => {
    const result = filterItems(items, 'Bank Account');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });
});

// ---------------------------------------------------------------------------
// groupByFolder
// ---------------------------------------------------------------------------
describe('groupByFolder', () => {
  it('groups items by folderId', () => {
    const items = [
      makeItem({ id: '1', folderId: 'f1', name: 'A' }),
      makeItem({ id: '2', folderId: 'f1', name: 'B' }),
      makeItem({ id: '3', folderId: 'f2', name: 'C' }),
    ];

    const grouped = groupByFolder(items, folders);
    expect(grouped.size).toBe(2);
    expect(grouped.get('f1')!.items).toHaveLength(2);
    expect(grouped.get('f2')!.items).toHaveLength(1);
  });

  it('places items with null folderId under "Unfiled"', () => {
    const items = [makeItem({ id: '1', folderId: null, name: 'A' })];

    const grouped = groupByFolder(items, folders);
    expect(grouped.size).toBe(1);
    expect(grouped.get(null)!.folderName).toBe('Unfiled');
  });

  it('uses folder name from folder list', () => {
    const items = [makeItem({ id: '1', folderId: 'f1', name: 'A' })];

    const grouped = groupByFolder(items, folders);
    expect(grouped.get('f1')!.folderName).toBe('Work');
  });

  it('falls back to "Unknown" for missing folder IDs', () => {
    const items = [makeItem({ id: '1', folderId: 'unknown', name: 'A' })];

    const grouped = groupByFolder(items, folders);
    expect(grouped.get('unknown')!.folderName).toBe('Unknown');
  });

  it('returns empty map for empty item list', () => {
    expect(groupByFolder([], folders).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// itemSubtitle
// ---------------------------------------------------------------------------
describe('itemSubtitle', () => {
  it('returns username for Login items', () => {
    const item = makeItem({
      type: ItemType.Login,
      login: { username: 'alice', password: 'secret', totp: null },
    });
    expect(itemSubtitle(item)).toBe('alice');
  });

  it('returns cardholder name for Card items', () => {
    const item = makeItem({
      type: ItemType.Card,
      card: {
        cardholderName: 'John Doe',
        brand: null,
        number: null,
        expMonth: null,
        expYear: null,
        code: null,
      },
    });
    expect(itemSubtitle(item)).toBe('John Doe');
  });

  it('returns brand + last4 for Card items without cardholder', () => {
    const item = makeItem({
      type: ItemType.Card,
      card: {
        cardholderName: null,
        brand: 'Visa',
        number: '4111111111111111',
        expMonth: null,
        expYear: null,
        code: null,
      },
    });
    expect(itemSubtitle(item)).toBe('Visa *1111');
  });

  it('returns full name for Identity items', () => {
    const item = makeItem({
      type: ItemType.Identity,
      identity: {
        firstName: 'Jane',
        lastName: 'Smith',
        title: null,
        middleName: null,
        email: null,
        phone: null,
        address1: null,
        address2: null,
        address3: null,
        city: null,
        state: null,
        postalCode: null,
        country: null,
        company: null,
        ssn: null,
        username: null,
        passportNumber: null,
        licenseNumber: null,
      },
    });
    expect(itemSubtitle(item)).toBe('Jane Smith');
  });

  it('returns undefined for Secure Note items', () => {
    const item = makeItem({ type: ItemType.SecureNote, secureNote: { type: 0 } });
    expect(itemSubtitle(item)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// itemTypeLabel
// ---------------------------------------------------------------------------
describe('itemTypeLabel', () => {
  it('returns Login for type 1', () => {
    expect(itemTypeLabel(makeItem({ type: ItemType.Login }))).toBe('Login');
  });
  it('returns Card for type 3', () => {
    expect(itemTypeLabel(makeItem({ type: ItemType.Card }))).toBe('Card');
  });
  it('returns Identity for type 4', () => {
    expect(itemTypeLabel(makeItem({ type: ItemType.Identity }))).toBe('Identity');
  });
  it('returns Secure Note for type 2', () => {
    expect(itemTypeLabel(makeItem({ type: ItemType.SecureNote }))).toBe('Secure Note');
  });
});

// ---------------------------------------------------------------------------
// itemActions
// ---------------------------------------------------------------------------
describe('itemActions', () => {
  it('returns username, password, TOTP, and URL actions for Login items', () => {
    const item = makeItem({
      type: ItemType.Login,
      login: {
        username: 'bob',
        password: 'pass123',
        totp: 'JBSWY3DPEHPK3PXP',
        uris: [{ uri: 'https://example.com', match: null }],
      },
    });
    const actions = itemActions(item);
    const labels = actions.map((a) => a.label);
    expect(labels).toContain('Copy Username');
    expect(labels).toContain('Copy Password');
    expect(labels).toContain('Copy TOTP');
    expect(labels).toContain('Open URL');
  });

  it('omits missing fields for Login items', () => {
    const item = makeItem({
      type: ItemType.Login,
      login: { username: null, password: 'pass', totp: null },
    });
    const actions = itemActions(item);
    const labels = actions.map((a) => a.label);
    expect(labels).toContain('Copy Password');
    expect(labels).not.toContain('Copy Username');
    expect(labels).not.toContain('Copy TOTP');
  });

  it('returns card number and code actions for Card items', () => {
    const item = makeItem({
      type: ItemType.Card,
      card: {
        cardholderName: null,
        brand: null,
        number: '4111111111111111',
        expMonth: null,
        expYear: null,
        code: '123',
      },
    });
    const actions = itemActions(item);
    const labels = actions.map((a) => a.label);
    expect(labels).toContain('Copy Card Number');
    expect(labels).toContain('Copy Security Code');
  });

  it('returns name, email, phone actions for Identity items', () => {
    const item = makeItem({
      type: ItemType.Identity,
      identity: {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@test.com',
        phone: '555-1234',
        title: null,
        middleName: null,
        address1: null,
        address2: null,
        address3: null,
        city: null,
        state: null,
        postalCode: null,
        country: null,
        company: null,
        ssn: null,
        username: null,
        passportNumber: null,
        licenseNumber: null,
      },
    });
    const actions = itemActions(item);
    const labels = actions.map((a) => a.label);
    expect(labels).toContain('Copy Name');
    expect(labels).toContain('Copy Email');
    expect(labels).toContain('Copy Phone');
  });

  it('returns empty actions for Secure Note items', () => {
    const item = makeItem({ type: ItemType.SecureNote, secureNote: { type: 0 } });
    expect(itemActions(item)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// toCreatePayload
// ---------------------------------------------------------------------------
describe('toCreatePayload', () => {
  it('serializes Login form values', () => {
    const values = {
      name: 'My Login',
      username: 'alice',
      password: 'secret',
      url: 'https://example.com',
      totp: 'JBSWY3DPEHPK3PXP',
      notes: 'some note',
    };
    const payload = toCreatePayload(values, ItemType.Login);

    expect(payload.type).toBe(ItemType.Login);
    expect(payload.name).toBe('My Login');
    expect(payload.notes).toBe('some note');
    expect(payload.login).toBeDefined();
    expect(payload.login!.username).toBe('alice');
    expect(payload.login!.password).toBe('secret');
    expect(payload.login!.totp).toBe('JBSWY3DPEHPK3PXP');
    expect(payload.login!.uris).toEqual([{ uri: 'https://example.com', match: null }]);
    expect(payload.folderId).toBeNull();
    expect(payload.favorite).toBe(false);
  });

  it('serializes Login without URL when URL is empty', () => {
    const payload = toCreatePayload(
      { name: 'Login', username: 'a', password: 'b' },
      ItemType.Login,
    );
    expect(payload.login!.uris).toBeUndefined();
  });

  it('serializes Card form values', () => {
    const values = {
      name: 'My Card',
      cardholderName: 'John Doe',
      brand: 'Visa',
      number: '4111111111111111',
      expMonth: '12',
      expYear: '2025',
      code: '123',
    };
    const payload = toCreatePayload(values, ItemType.Card);

    expect(payload.type).toBe(ItemType.Card);
    expect(payload.card).toBeDefined();
    expect(payload.card!.cardholderName).toBe('John Doe');
    expect(payload.card!.brand).toBe('Visa');
    expect(payload.card!.number).toBe('4111111111111111');
  });

  it('serializes Identity form values', () => {
    const values = {
      name: 'My Identity',
      title: 'Mr',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@test.com',
      phone: '555-1234',
    };
    const payload = toCreatePayload(values, ItemType.Identity);

    expect(payload.type).toBe(ItemType.Identity);
    expect(payload.identity).toBeDefined();
    expect(payload.identity!.firstName).toBe('John');
    expect(payload.identity!.lastName).toBe('Doe');
    expect(payload.identity!.email).toBe('john@test.com');
  });

  it('serializes Secure Note form values', () => {
    const values = { name: 'My Note', notes: 'secret text' };
    const payload = toCreatePayload(values, ItemType.SecureNote);

    expect(payload.type).toBe(ItemType.SecureNote);
    expect(payload.secureNote).toEqual({ type: 0 });
  });

  it('trims whitespace from string values', () => {
    const values = {
      name: '  My Login  ',
      username: '  alice  ',
      password: 'secret',
    };
    const payload = toCreatePayload(values, ItemType.Login);
    expect(payload.name).toBe('  My Login  ');
    expect(payload.login!.username).toBe('alice');
  });

  it('converts empty strings to null for optional fields', () => {
    const payload = toCreatePayload({ name: 'Item', notes: '   ' }, ItemType.Login);
    expect(payload.notes).toBeNull();
  });

  it('includes custom fields when provided', () => {
    const payload = toCreatePayload({ name: 'Item' }, ItemType.Login, null, [
      { name: 'API Key', value: 'abc123', type: 0 },
      { name: 'PIN', value: '9999', type: 0 },
    ]);
    expect(payload.fields).toEqual([
      { name: 'API Key', value: 'abc123', type: 0 },
      { name: 'PIN', value: '9999', type: 0 },
    ]);
  });

  it('omits fields when empty array provided', () => {
    const payload = toCreatePayload({ name: 'Item' }, ItemType.Login, null, []);
    expect(payload.fields).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildItemDetailMarkdown
// ---------------------------------------------------------------------------
describe('buildItemDetailMarkdown', () => {
  it('returns empty string when no notes or custom fields', () => {
    const md = buildItemDetailMarkdown(makeItem({ name: 'My Item' }));
    expect(md).toBe('');
  });

  it('shows notes when present', () => {
    const item = makeItem({ notes: 'Some note text' });
    const md = buildItemDetailMarkdown(item);
    expect(md).toContain('Some note text');
  });

  it('shows Secure Note content as notes', () => {
    const item = makeItem({
      type: ItemType.SecureNote,
      notes: 'My secret note',
      secureNote: { type: 0 },
    });
    const md = buildItemDetailMarkdown(item);
    expect(md).toContain('My secret note');
  });

  it('shows custom fields in metadata, not markdown', () => {
    const item = makeItem({
      fields: [
        { name: 'API Key', value: 'abc123', type: 0, linkedId: null },
        { name: 'Secret', value: 'xyz', type: 1, linkedId: null },
        { name: 'Notes', value: 'some value', type: 0, linkedId: null },
      ],
    });
    const md = buildItemDetailMarkdown(item);
    expect(md).not.toContain('API Key');
  });

  it('shows password when showPassword is true', () => {
    // Password moved to metadata sidebar — markdown no longer contains it
    const md = buildItemDetailMarkdown(makeItem({ name: 'My Item' }));
    expect(md).toBe('');
  });
});

// ---------------------------------------------------------------------------
// itemIcon
// ---------------------------------------------------------------------------
describe('itemIcon', () => {
  it('returns favicon Image object when real URL cached in map', () => {
    const item = makeItem({
      type: ItemType.Login,
      login: {
        username: null,
        password: null,
        totp: null,
        uris: [{ uri: 'https://github.com/login', match: null }],
      },
    });
    const icon = itemIcon(item, { 'github.com': 'https://github.com/favicon.ico' }) as {
      source: string;
      fallback: string;
    };
    expect(icon.source).toBe('https://github.com/favicon.ico');
    expect(icon.fallback).toBe('key');
  });

  it('returns key icon for Login items without URL', () => {
    const item = makeItem({
      type: ItemType.Login,
      login: { username: null, password: null, totp: null },
    });
    expect(itemIcon(item)).toBe('key');
  });

  it('returns credit-card icon for Card items', () => {
    const item = makeItem({ type: ItemType.Card });
    expect(itemIcon(item)).toBe('credit-card');
  });

  it('returns person icon for Identity items', () => {
    const item = makeItem({ type: ItemType.Identity });
    expect(itemIcon(item)).toBe('person');
  });
});

// ---------------------------------------------------------------------------
// loadCachedVault
// ---------------------------------------------------------------------------
describe('loadCachedVault', () => {
  it('returns null when no cached data exists', async () => {
    mockGetItem.mockResolvedValue(undefined);

    const result = await loadCachedVault();
    expect(result).toBeNull();
  });

  it('returns cached vault when fresh', async () => {
    const cache = {
      items: [{ id: '1', name: 'A', type: 1 }],
      folders: [{ id: 'f1', name: 'Work' }],
      timestamp: Date.now(),
    };
    mockGetItem.mockResolvedValue(JSON.stringify(cache));

    const result = await loadCachedVault();
    expect(result).toEqual({ items: cache.items, folders: cache.folders });
  });

  it('returns null when cache is older than 24 hours', async () => {
    const staleTimestamp = Date.now() - 25 * 60 * 60 * 1000;
    const cache = { items: [], folders: [], timestamp: staleTimestamp };
    mockGetItem.mockResolvedValue(JSON.stringify(cache));

    const result = await loadCachedVault();
    expect(result).toBeNull();
  });

  it('returns null on JSON parse error', async () => {
    mockGetItem.mockResolvedValue('not json {{{');

    const result = await loadCachedVault();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// saveCachedVault
// ---------------------------------------------------------------------------
describe('saveCachedVault', () => {
  it('stores items, folders, and timestamp to LocalStorage', async () => {
    const items = [{ id: '1', name: 'A', type: 1 } as BwItem];
    const folders = [{ id: 'f1', name: 'Work' }];

    await saveCachedVault(items, folders);

    expect(mockSetItem).toHaveBeenCalledTimes(1);
    const [key, raw] = mockSetItem.mock.calls[0] as [string, string];
    expect(key).toBe('vicinae-bitwarden-cache');
    const parsed = JSON.parse(raw);
    expect(parsed.items).toEqual(items);
    expect(parsed.folders).toEqual(folders);
    expect(parsed.timestamp).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// clearCachedVault
// ---------------------------------------------------------------------------
describe('clearCachedVault', () => {
  it('removes both vault and favicon cache keys', async () => {
    await clearCachedVault();

    expect(mockRemoveItem).toHaveBeenCalledWith('vicinae-bitwarden-cache');
    expect(mockRemoveItem).toHaveBeenCalledWith('vicinae-bitwarden-favicons');
    expect(mockRemoveItem).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// loadFaviconCache
// ---------------------------------------------------------------------------
describe('loadFaviconCache', () => {
  it('returns empty object when no favicon cache exists', async () => {
    mockGetItem.mockResolvedValue(undefined);

    const result = await loadFaviconCache();
    expect(result).toEqual({});
  });

  it('returns parsed favicon map from LocalStorage', async () => {
    const map = {
      'github.com': 'data:image/png;base64,abc',
      'example.com': 'data:image/png;base64,def',
    };
    mockGetItem.mockResolvedValue(JSON.stringify(map));

    const result = await loadFaviconCache();
    expect(result).toEqual(map);
  });

  it('returns empty object on parse error', async () => {
    mockGetItem.mockResolvedValue('bad json');

    const result = await loadFaviconCache();
    expect(result).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// clearFaviconCache
// ---------------------------------------------------------------------------
describe('clearFaviconCache', () => {
  it('clears the in-memory favicon cache', async () => {
    // Pre-populate by calling resolveFavicons with a stubbed fetch
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => new Uint8Array([]).buffer,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await resolveFavicons(['test.com']);
    expect(result['test.com']).toBeTruthy();

    clearFaviconCache();

    // After clearing, a subsequent resolve should re-fetch
    const result2 = await resolveFavicons(['test.com']);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// resolveFavicons
// ---------------------------------------------------------------------------

function createFetchMock() {
  return vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => 'image/png' },
    arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
    status: 200,
  });
}

describe('resolveFavicons', () => {
  it('returns cached favicons without re-fetching', async () => {
    clearFaviconCache();
    const fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    // First call fetches
    const r1 = await resolveFavicons(['github.com']);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call uses cache
    const r2 = await resolveFavicons(['github.com']);
    expect(r2['github.com']).toBe(r1['github.com']);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it('handles HTTP errors gracefully', async () => {
    clearFaviconCache();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const result = await resolveFavicons(['bad.com']);
    expect(result['bad.com']).toBe('');

    vi.unstubAllGlobals();
  });

  it('handles network errors gracefully', async () => {
    clearFaviconCache();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const result = await resolveFavicons(['offline.com']);
    expect(result['offline.com']).toBe('');

    vi.unstubAllGlobals();
  });

  it('deduplicates domains', async () => {
    clearFaviconCache();
    const fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    await resolveFavicons(['a.com', 'a.com', 'b.com']);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });
});
