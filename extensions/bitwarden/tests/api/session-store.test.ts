import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Item, Folder } from "../../src/types/bitwarden";

const storage = new Map<string, string | number | boolean>();
let savedTokens: { accessToken: string } | null = null;

vi.mock("@vicinae/api", () => ({
  LocalStorage: {
    getItem: vi.fn(async (key: string) => storage.get(key)),
    setItem: vi.fn(async (key: string, value: string | number | boolean) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
    allItems: vi.fn(async () => Object.fromEntries(storage)),
  },
  OAuth: {
    RedirectMethod: { Web: "web" },
    PKCEClient: class {
      setTokens(opts: { accessToken: string }) { savedTokens = { accessToken: opts.accessToken }; return Promise.resolve(); }
      getTokens() {
        return Promise.resolve(savedTokens ? { ...savedTokens, updatedAt: new Date(), isExpired: () => false } : undefined);
      }
      removeTokens() { savedTokens = null; return Promise.resolve(); }
    },
  },
}));

import {
  saveSession, loadSession, clearSession,
  saveCache, loadCache, clearCache,
  getLastAppliedServerUrl, setLastAppliedServerUrl,
  setRepromptTimestamp, getRepromptTimestamp, clearAllReprompt,
} from "../../src/api/session-store";

const sampleItem: Item = {
  object: "item", id: "i1", organizationId: null, folderId: "f1", type: 1, reprompt: 0,
  name: "GitHub", notes: "secret note", favorite: false,
  fields: [{ name: "pin", value: "1234", type: 1 }],
  login: { username: "u", password: "p", totp: "T", uris: [{ match: null, uri: "https://gh" }], passwordRevisionDate: null },
  collectionIds: null, revisionDate: "", creationDate: "", deletedDate: null,
};
const sampleFolder: Folder = { object: "folder", id: "f1", name: "Personal" };

beforeEach(() => {
  storage.clear();
  savedTokens = null;
});

describe("session token persistence (rbw: agent-owned)", () => {
  it("loadSession returns null — rbw-agent owns unlock state", async () => {
    await saveSession("SESSION-XYZ");
    expect(await loadSession()).toBeNull();
  });

  it("clearSession is a no-op that succeeds", async () => {
    await saveSession("SESSION-XYZ");
    await clearSession();
    expect(await loadSession()).toBeNull();
  });
});

describe("vault cache", () => {
  it("saveCache + loadCache round-trips items and folders", async () => {
    await saveCache([sampleItem], [sampleFolder]);
    const out = await loadCache();
    expect(out).not.toBeNull();
    expect(out!.items[0]!.id).toBe("i1");
    expect(out!.folders[0]!.id).toBe("f1");
  });

  it("saveCache strips sensitive fields before persisting", async () => {
    await saveCache([sampleItem], [sampleFolder]);
    const out = await loadCache();
    expect(out!.items[0]!.login?.password).toBeNull();
    expect(out!.items[0]!.login?.totp).toBeNull();
    expect(out!.items[0]!.login?.username).toBe("u");
    expect(out!.items[0]!.notes).toBeNull();
    expect(out!.items[0]!.fields).toBeUndefined();
  });

  it("loadCache returns null when items are missing", async () => {
    expect(await loadCache()).toBeNull();
  });

  it("saveCache stamps a recent mtime", async () => {
    const before = Date.now();
    await saveCache([sampleItem], [sampleFolder]);
    const out = await loadCache();
    expect(out).not.toBeNull();
    expect(out!.mtime).toBeGreaterThanOrEqual(before);
    expect(out!.mtime).toBeLessThanOrEqual(Date.now());
  });

  it("clearCache removes both items and folders", async () => {
    await saveCache([sampleItem], [sampleFolder]);
    await clearCache();
    expect(await loadCache()).toBeNull();
  });
});

describe("last-applied server URL", () => {
  it("returns null when never set", async () => {
    expect(await getLastAppliedServerUrl()).toBeNull();
  });

  it("round-trips a URL", async () => {
    await setLastAppliedServerUrl("https://vault.example.com");
    expect(await getLastAppliedServerUrl()).toBe("https://vault.example.com");
  });
});

describe("reprompt timestamps", () => {
  it("setRepromptTimestamp + getRepromptTimestamp round-trip", async () => {
    await setRepromptTimestamp("item-1");
    const ts = await getRepromptTimestamp("item-1");
    expect(typeof ts).toBe("number");
    expect(Date.now() - ts!).toBeLessThan(5000);
  });

  it("getRepromptTimestamp returns null when never set", async () => {
    expect(await getRepromptTimestamp("never-set")).toBeNull();
  });

  it("clearAllReprompt removes only reprompt keys", async () => {
    await setRepromptTimestamp("a");
    await setRepromptTimestamp("b");
    await setLastAppliedServerUrl("https://x");
    await clearAllReprompt();
    expect(await getRepromptTimestamp("a")).toBeNull();
    expect(await getRepromptTimestamp("b")).toBeNull();
    expect(await getLastAppliedServerUrl()).toBe("https://x");
  });
});
