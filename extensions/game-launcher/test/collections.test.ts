import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyFilter,
  collectionNamesFor,
  collectionOptions,
  hiddenGameIds,
  resolveFilter,
} from "../src/lib/game-views";
import { type Game, sourceOfGameId } from "../src/lib/games";
import { type LibraryScan, scanLibrary } from "../src/lib/library";
import { parseCollections, readSteamCollections } from "../src/lib/steam/collections";
import { scanSteamInstall } from "../src/lib/steam/library";
import { emptyHiddenState, isAnyHidden, isHidden, pruneShown, toggleHidden } from "../src/lib/visibility";
import { makeTempDir, manifest, writeFile } from "./fixtures/fake-steam";

/** A cloud-storage-namespace-1.json document, in Steam's [key, entry] pair format. */
function cloudStorage(collections: Record<string, object | { deleted: true }>, extra: [string, object][] = []): string {
  const pairs: [string, object][] = Object.entries(collections).map(([id, value]) => [
    `user-collections.${id}`,
    "deleted" in value
      ? { key: `user-collections.${id}`, timestamp: 1, is_deleted: true, version: "2" }
      : { key: `user-collections.${id}`, timestamp: 1, value: JSON.stringify({ id, ...value }), version: "1" },
  ]);
  return JSON.stringify([...extra, ...pairs]);
}

const dynamicSpec = { filterSpec: { nFormatVersion: 2, strSearchText: "", filterGroups: [{ rgOptions: [] }, { rgOptions: [7] }] } };
const emptySpec = { filterSpec: { nFormatVersion: 2, strSearchText: "", filterGroups: [{ rgOptions: [] }, { rgOptions: [] }] } };

describe("parseCollections", () => {
  it("reads favorites, hidden and static user collections", () => {
    const parsed = parseCollections(
      cloudStorage(
        {
          favorite: { name: "Favorites", added: [10, 20], removed: [] },
          hidden: { name: "Hidden", added: [30, 40], removed: [40] },
          "uc-b": { name: "beta", added: [10], removed: [] },
          "uc-a": { name: "Alpha", added: [20, 99], removed: [99] },
          "uc-empty-spec": { name: "Manual with empty rules", added: [10], removed: [], ...emptySpec },
          "uc-dyn": { name: "Dynamic", added: [], removed: [], ...dynamicSpec },
          "uc-gone": { deleted: true },
          "partner-ea-access": { name: "ea" },
        },
        [["showcases-version", { key: "showcases-version", value: "3" }]],
      ),
    );
    expect(parsed.favorites).toEqual({ id: "favorite", name: "Favorites", appids: new Set([10, 20]) });
    expect(parsed.hidden).toEqual(new Set([30]));
    expect(parsed.user.map((c) => c.name)).toEqual(["Alpha", "beta", "Manual with empty rules"]);
    expect(parsed.user[0]?.appids).toEqual(new Set([20]));
    expect(parsed.dynamicSkipped).toBe(1);
  });

  it("survives junk, and reports that the read failed", () => {
    expect(parseCollections("not json")).toMatchObject({ user: [], ok: false });
    expect(parseCollections("{}")).toMatchObject({ ok: false });
    expect(parseCollections("[]").ok).toBe(true);
    expect(parseCollections(JSON.stringify([["user-collections.uc-x", { value: "{bad" }], 5, null])).user).toEqual([]);
  });

  it("merges collections across Steam accounts", () => {
    const a = makeTempDir();
    const b = makeTempDir();
    writeFile(join(a, "config/cloudstorage/cloud-storage-namespace-1.json"), cloudStorage({ hidden: { added: [1] }, "uc-x": { name: "X", added: [1] } }));
    writeFile(join(b, "config/cloudstorage/cloud-storage-namespace-1.json"), cloudStorage({ hidden: { added: [2] }, "uc-x": { name: "X", added: [2] } }));
    const merged = readSteamCollections([a, b, makeTempDir()]);
    expect(merged.hidden).toEqual(new Set([1, 2]));
    expect(merged.user).toHaveLength(1);
    expect(merged.user[0]?.appids).toEqual(new Set([1, 2]));
  });
});

describe("scanSteamInstall collections", () => {
  it("exposes Steam collections and hidden games as game ids", () => {
    const root = makeTempDir();
    writeFile(join(root, "steamapps/appmanifest_10.acf"), manifest({ appid: 10, name: "Ten", installdir: "Ten" }));
    writeFile(
      join(root, "userdata/42/config/cloudstorage/cloud-storage-namespace-1.json"),
      cloudStorage({ favorite: { name: "Favorites", added: [10] }, hidden: { added: [10] }, "uc-d": { name: "D", ...dynamicSpec } }),
    );
    const result = scanSteamInstall({ root, kind: "native" });
    expect(result.collections).toEqual([
      { id: "steam:favorite", name: "Favorites", source: "steam", kind: "favorites", gameIds: new Set(["steam:10"]) },
    ]);
    expect(result.hiddenInLauncher).toEqual(new Set(["steam:10"]));
    expect(result.dynamicCollectionsSkipped).toBe(1);
  });
});

describe("visibility", () => {
  const steamHidden = new Set(["steam:2"]);

  it("merges our hidden list with Steam's", () => {
    const state = { hidden: new Set(["steam:1"]), shown: new Set<string>() };
    expect(isHidden("steam:1", state, steamHidden)).toBe(true);
    expect(isHidden("steam:2", state, steamHidden)).toBe(true);
    expect(isHidden("steam:3", state, steamHidden)).toBe(false);
  });

  it("hides and unhides our own games", () => {
    const hid = toggleHidden(["steam:1"], emptyHiddenState(), steamHidden);
    expect(hid).toMatchObject({ nowHidden: true, stillHiddenInLauncher: [] });
    const unhid = toggleHidden(["steam:1"], hid.state, steamHidden);
    expect(unhid).toMatchObject({ nowHidden: false, stillHiddenInLauncher: [] });
    expect(unhid.state).toEqual(emptyHiddenState());
  });

  it("shows a Steam-hidden game with an override, and hiding it again drops the override", () => {
    const shown = toggleHidden(["steam:2"], emptyHiddenState(), steamHidden);
    expect(shown).toMatchObject({ nowHidden: false, stillHiddenInLauncher: ["steam:2"] });
    expect(isHidden("steam:2", shown.state, steamHidden)).toBe(false);
    const again = toggleHidden(["steam:2"], shown.state, steamHidden);
    expect(again.nowHidden).toBe(true);
    expect(again.state).toEqual(emptyHiddenState());
  });

  it("treats a merged entry as hidden if any copy is, and unhides every copy", () => {
    const copies = ["steam:1", "lutris:5", "lutris:6"];
    const launcherHidden = new Set(["lutris:5"]);
    const state = { hidden: new Set(["steam:1"]), shown: new Set<string>() };
    expect(isAnyHidden(copies, emptyHiddenState(), launcherHidden)).toBe(true);
    expect(isAnyHidden(["steam:1"], emptyHiddenState(), launcherHidden)).toBe(false);

    const unhid = toggleHidden(copies, state, launcherHidden);
    expect(unhid).toMatchObject({ nowHidden: false, stillHiddenInLauncher: ["lutris:5"] });
    expect(unhid.state).toEqual({ hidden: new Set(), shown: new Set(["lutris:5"]) });
    expect(isAnyHidden(copies, unhid.state, launcherHidden)).toBe(false);

    // Hiding again restores the launcher's own choice for its copy and hides the other copies here.
    const rehid = toggleHidden(copies, unhid.state, launcherHidden);
    expect(rehid.nowHidden).toBe(true);
    expect(rehid.state).toEqual({ hidden: new Set(["steam:1", "lutris:6"]), shown: new Set() });
  });

  it("hides every copy of a merged entry, so each stays hidden if duplicates are later shown separately", () => {
    const result = toggleHidden(["lutris:5", "steam:1"], emptyHiddenState(), new Set());
    expect(result.state.hidden).toEqual(new Set(["lutris:5", "steam:1"]));
    expect(isHidden("steam:1", result.state, new Set())).toBe(true);
  });

  it("prunes overrides for games Steam no longer hides", () => {
    const state = { hidden: new Set<string>(), shown: new Set(["steam:2", "steam:9"]) };
    const trusted = new Set(["steam"]);
    expect(pruneShown(state, steamHidden, trusted)?.shown).toEqual(new Set(["steam:2"]));
    expect(pruneShown({ hidden: new Set(), shown: new Set(["steam:2"]) }, steamHidden, trusted)).toBeUndefined();
  });

  it("works out an id's launcher, ignoring malformed or unknown ids", () => {
    expect(sourceOfGameId("steam:10")).toBe("steam");
    expect(sourceOfGameId("lutris:42-old-game")).toBe("lutris");
    expect(sourceOfGameId("heroic:gog:12")).toBe("heroic");
    expect(sourceOfGameId("itch:abc")).toBeUndefined();
    expect(sourceOfGameId("no-colon")).toBeUndefined();
    // Unknown-launcher overrides are kept rather than pruned under the wrong launcher.
    const state = { hidden: new Set<string>(), shown: new Set(["no-colon", "heroic:abc", "lutris:9-x"]) };
    expect(pruneShown(state, new Set(), new Set(["lutris"]))?.shown).toEqual(new Set(["no-colon", "heroic:abc"]));
  });

  it("leaves overrides alone for launchers whose hidden list wasn't read (disabled or unreadable)", () => {
    const state = { hidden: new Set<string>(), shown: new Set(["steam:9", "lutris:4"]) };
    expect(pruneShown(state, new Set(), new Set(["lutris"]))?.shown).toEqual(new Set(["steam:9"]));
    expect(pruneShown(state, new Set(), new Set())).toBeUndefined();
  });
});

describe("game views", () => {
  const game = (n: number) => ({ id: `steam:${n}`, title: `G${n}` }) as Game;
  const scan = {
    games: [game(1), game(2), game(3), game(4)],
    collections: [
      { id: "steam:favorite", name: "Favorites", source: "steam", kind: "favorites", gameIds: new Set(["steam:1", "steam:2", "steam:99"]) },
      { id: "steam:uc-a", name: "Only hidden", source: "steam", kind: "user", gameIds: new Set(["steam:3"]) },
      { id: "steam:uc-b", name: "Not installed", source: "steam", kind: "user", gameIds: new Set(["steam:99"]) },
    ],
    hiddenInLauncher: new Set(["steam:3"]),
  } as unknown as LibraryScan;
  const hidden = hiddenGameIds(scan, { hidden: new Set(["steam:2"]), shown: new Set() });

  it("computes hidden ids from both sources", () => {
    expect(hidden).toEqual(new Set(["steam:2", "steam:3"]));
  });

  it("offers only collections with visible installed games, with counts", () => {
    expect(collectionOptions(scan, hidden).map((o) => [o.collection.name, o.count])).toEqual([["Favorites", 1]]);
  });

  it("filters by view", () => {
    expect(applyFilter(scan, hidden, "visible").map((g) => g.id)).toEqual(["steam:1", "steam:4"]);
    expect(applyFilter(scan, hidden, "hidden").map((g) => g.id)).toEqual(["steam:2", "steam:3"]);
    expect(applyFilter(scan, hidden, "collection:steam:favorite").map((g) => g.id)).toEqual(["steam:1"]);
  });

  it("falls back to all games when a selected collection disappears", () => {
    const options = collectionOptions(scan, hidden);
    expect(resolveFilter("collection:steam:favorite", options)).toBe("collection:steam:favorite");
    expect(resolveFilter("collection:steam:uc-a", options)).toBe("visible");
    expect(resolveFilter("hidden", options)).toBe("hidden");
  });

  it("names a game's collections", () => {
    expect(collectionNamesFor(scan, "steam:1")).toEqual(["Favorites"]);
    expect(collectionNamesFor(scan, "steam:4")).toEqual([]);
  });
});

describe("hiddenListsComplete", () => {
  function steamWithCollections(json: string | undefined) {
    const root = makeTempDir();
    writeFile(join(root, "steamapps/appmanifest_1.acf"), manifest({ appid: 1, name: "One", installdir: "One" }));
    if (json !== undefined) writeFile(join(root, "userdata/7/config/cloudstorage/cloud-storage-namespace-1.json"), json);
    return root;
  }
  const scan = (root: string) => scanLibrary({ steamPath: root, home: makeTempDir(), enabledLaunchers: ["steam"] });

  it("is true for a full scan with a readable (or absent) collections file", () => {
    expect(scan(steamWithCollections(cloudStorage({ hidden: { added: [1] } }))).hiddenListsComplete.has("steam")).toBe(true);
    expect(scan(steamWithCollections(undefined)).hiddenListsComplete.has("steam")).toBe(true);
  });

  it("is false when Steam's collections file is unreadable (e.g. mid-write)", () => {
    expect(scan(steamWithCollections('[["user-collections.hidden", {"val')).hiddenListsComplete.has("steam")).toBe(false);
  });

  it("is false when no Steam install was found", () => {
    expect(scanLibrary({ home: makeTempDir() }).hiddenListsComplete.size).toBe(0);
  });
});
