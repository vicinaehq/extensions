import { describe, it, expect } from "vitest";
import { adaptListEntry, adaptGetEntry, deriveFolders, type RbwListEntry, type RbwGetEntry } from "../../src/api/rbw-adapter";

const sampleList: RbwListEntry = {
  id: "abc", name: "Acme", user: "alice", folder: "Work", uris: ["https://acme.example"], type: "Login",
};

const sampleGet: RbwGetEntry = {
  id: "abc",
  name: "Acme",
  folder: "Work",
  data: { username: "alice", password: "p4ss", totp: "JBSW", uris: ["https://acme.example"] },
  fields: [{ name: "tag", value: "login", type: "text" }],
  notes: "n",
  history: [],
};

describe("adaptListEntry", () => {
  it("maps a Login entry to a sparse Item", () => {
    const item = adaptListEntry(sampleList);
    expect(item.id).toBe("abc");
    expect(item.type).toBe(1);
    expect(item.folderId).toBe("Work");
    expect(item.login?.username).toBe("alice");
    expect(item.login?.password).toBeNull();
    expect(item.login?.uris?.[0]).toEqual({ uri: "https://acme.example", match: null });
  });

  it("translates rbw type strings", () => {
    expect(adaptListEntry({ ...sampleList, type: "SecureNote" }).type).toBe(2);
    expect(adaptListEntry({ ...sampleList, type: "Card" }).type).toBe(3);
    expect(adaptListEntry({ ...sampleList, type: "Identity" }).type).toBe(4);
  });

  it("emits null folderId for unfoldered entries", () => {
    expect(adaptListEntry({ ...sampleList, folder: null }).folderId).toBeNull();
  });
});

describe("adaptGetEntry", () => {
  it("maps a full Login entry with password and totp", () => {
    const item = adaptGetEntry(sampleGet);
    expect(item.login?.password).toBe("p4ss");
    expect(item.login?.totp).toBe("JBSW");
    expect(item.notes).toBe("n");
    expect(item.fields?.[0]).toEqual({ name: "tag", value: "login", type: 0 });
  });

  it("survives missing data fields", () => {
    const empty: RbwGetEntry = { id: "x", name: "x", folder: null, data: { username: null, password: null, totp: null, uris: [] }, fields: [], notes: null, history: [] };
    const item = adaptGetEntry(empty);
    expect(item.login?.username).toBeNull();
    expect(item.login?.password).toBeNull();
    expect(item.fields).toEqual([]);
  });
});

describe("deriveFolders", () => {
  it("emits distinct non-null folders sorted by name", () => {
    const folders = deriveFolders([
      { ...sampleList, folder: "Work" },
      { ...sampleList, folder: null },
      { ...sampleList, folder: "Personal" },
      { ...sampleList, folder: "Work" },
    ]);
    expect(folders.map((f) => f.name)).toEqual(["Personal", "Work"]);
    expect(folders[0]).toEqual({ object: "folder", id: "Personal", name: "Personal" });
  });
});
