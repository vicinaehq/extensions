import type { Item, Folder, ItemType, Login } from "../types/bitwarden";

export type RbwTypeName = "Login" | "SecureNote" | "Card" | "Identity";

export interface RbwListEntry {
  id: string;
  name: string;
  user: string | null;
  folder: string | null;
  uris: RbwUri[];
  type: RbwTypeName;
}

type RbwUri = string | { uri: string; match?: number | null };

export interface RbwGetEntry {
  id: string;
  name: string;
  folder: string | null;
  data: { username: string | null; password: string | null; totp: string | null; uris: RbwUri[] };
  fields: { name: string; value: string | null; type: "text" | "hidden" | "boolean" | "linked" }[];
  notes: string | null;
  history: { last_used_date: string; password: string }[];
}

function normalizeUris(uris: RbwUri[] | undefined | null): string[] {
  if (!uris) return [];
  return uris
    .map((u) => (typeof u === "string" ? u : u?.uri))
    .filter((u): u is string => typeof u === "string" && u.length > 0);
}

const TYPE_MAP: Record<RbwTypeName, ItemType> = { Login: 1, SecureNote: 2, Card: 3, Identity: 4 };
const FIELD_TYPE_MAP: Record<RbwGetEntry["fields"][number]["type"], 0 | 1 | 2 | 3> = {
  text: 0, hidden: 1, boolean: 2, linked: 3,
};

function emptyItem(id: string, name: string, type: ItemType, folderId: string | null): Item {
  return {
    object: "item",
    id, name, type, folderId,
    organizationId: null,
    reprompt: 0,
    notes: null,
    favorite: false,
    fields: [],
    collectionIds: null,
    revisionDate: "",
    creationDate: "",
    deletedDate: null,
  };
}

function loginFrom(username: string | null, password: string | null, totp: string | null, uris: string[]): Login {
  return {
    username, password, totp,
    uris: uris.map((u) => ({ uri: u, match: null })),
    passwordRevisionDate: null,
  };
}

export function adaptListEntry(e: RbwListEntry): Item {
  const item = emptyItem(e.id, e.name, TYPE_MAP[e.type], e.folder ?? null);
  if (e.type === "Login") {
    item.login = loginFrom(e.user ?? null, null, null, normalizeUris(e.uris));
  }
  return item;
}

export function adaptGetEntry(e: RbwGetEntry, knownType: ItemType = 1): Item {
  const item = emptyItem(e.id, e.name, knownType, e.folder ?? null);
  if (knownType === 1) {
    item.login = loginFrom(
      e.data?.username ?? null,
      e.data?.password ?? null,
      e.data?.totp ?? null,
      normalizeUris(e.data?.uris),
    );
  }
  item.notes = e.notes ?? null;
  item.fields = (e.fields ?? []).map((f) => ({ name: f.name, value: f.value, type: FIELD_TYPE_MAP[f.type] ?? 0 }));
  return item;
}

export function deriveFolders(entries: RbwListEntry[]): Folder[] {
  const set = new Set<string>();
  for (const e of entries) if (e.folder) set.add(e.folder);
  return [...set].sort().map((name): Folder => ({ object: "folder", id: name, name }));
}
