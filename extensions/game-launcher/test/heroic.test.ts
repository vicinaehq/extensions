import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { artKeyOf } from "../src/lib/artwork-cache";
import { artKeyFor, requestFor } from "../src/lib/artwork-requests";
import { findHeroicInstalls } from "../src/lib/heroic/paths";
import { heroicLaunchUri, scanHeroic, sizeOf } from "../src/lib/heroic/scan";
import { mergeCopies, scanLaunchers, scanLibrary } from "../src/lib/library";
import { launcherDetails } from "../src/lib/store-info";
import { flatpakHeroic, heroicCachedImage, makeHeroicConfig } from "./fixtures/fake-heroic";
import { makeLutrisDb } from "./fixtures/fake-lutris";
import { makeTempDir, writeFile } from "./fixtures/fake-steam";

const EPIC_ID = "ed93b18355a84230938c705121c63661";
const SQUARE = "https://cdn1.epicgames.com/x/item/EGS_TheLongDark-1200x1600.jpg";
const COVER = "https://cdn1.epicgames.com/x/item/EGS_TheLongDark-1920x1080.jpg";

function epicGame(extra: Record<string, unknown> = {}) {
  return {
    [EPIC_ID]: {
      app_name: EPIC_ID,
      title: "The Long Dark",
      install_path: "/home/u/Games/Heroic/TheLongDark",
      install_size: 3809056723,
      is_dlc: false,
      platform: "Windows",
      ...extra,
    },
  };
}

describe("findHeroicInstalls", () => {
  it("finds native and Flatpak installs by their config.json and store/", () => {
    const home = makeTempDir();
    makeHeroicConfig(join(home, ".config/heroic"));
    makeHeroicConfig(flatpakHeroic(home));
    writeFile(join(home, "not-heroic/config.json"), "{}");
    expect(findHeroicInstalls({ home }).map((i) => i.kind)).toEqual(["native", "flatpak"]);
    expect(findHeroicInstalls({ home, override: join(home, "not-heroic") })).toEqual([]);
  });
});

describe("scanHeroic", () => {
  it("reads Epic games with play data, local art and store art URLs", () => {
    const home = makeTempDir();
    const root = makeHeroicConfig(flatpakHeroic(home), {
      legendaryInstalled: { ...epicGame(), dlc1: { app_name: "dlc1", title: "Some DLC", is_dlc: true } },
      libraries: { legendary: [{ app_name: EPIC_ID, title: "The Long Dark", art_square: SQUARE, art_cover: COVER }] },
      timestamps: { [EPIC_ID]: { lastPlayed: "2026-11-15T22:53:50.885Z", totalPlayed: 125 } },
    });
    const portrait = heroicCachedImage(root, `${SQUARE}?h=400&resize=1&w=300`);
    const icon = writeFile(join(root, "icons", `${EPIC_ID}.jpg`));

    const result = scanHeroic({ home });
    expect(result).toMatchObject({ found: true, complete: true, hiddenListComplete: true, warnings: [] });
    expect(result.games).toHaveLength(1);
    expect(result.games[0]).toMatchObject({
      id: `heroic:legendary:${EPIC_ID}`,
      source: "heroic",
      title: "The Long Dark",
      launchUri: `heroic://launch?appName=${EPIC_ID}&runner=legendary`,
      installDir: "/home/u/Games/Heroic/TheLongDark",
      sizeOnDisk: 3809056723,
      lastPlayed: Math.floor(Date.parse("2026-11-15T22:53:50.885Z") / 1000),
      playtimeMinutes: 125,
      storeIds: [`egs:${EPIC_ID}`],
      artwork: { portrait, icon },
      heroic: { appName: EPIC_ID, runner: "legendary", platform: "Windows", artUrls: { portrait: SQUARE, header: COVER } },
    });
    expect(result.games[0]?.keywords).toEqual(expect.arrayContaining(["tld", "epic"]));
  });

  it("reads GOG, Amazon, ZOOM, third-party Epic and sideloaded games", () => {
    const home = makeTempDir();
    const sideArt = writeFile(join(home, "pics/side.png")); // sideloaded apps' art may be a local file
    makeHeroicConfig(flatpakHeroic(home), {
      thirdParty: [["ubi-game", "Windows"]],
      gogInstalled: [
        { appName: "1207658901", install_path: "/g/Tyrian 2000", platform: "windows", install_size: "3.37 GiB" },
        { appName: "999", install_path: "/g/No Title Folder", platform: "linux" },
        { appName: "555", install_path: "/g/dlc", is_dlc: true },
      ],
      nileInstalled: [{ id: "amzn1.adg.product.abc", path: "/g/Amazon Game", size: 1234 }],
      zoomInstalled: [{ appName: "42", install_path: "/g/Zoom Game", platform: "windows" }],
      sideloaded: [
        { app_name: "side1", runner: "sideload", title: "My App", is_installed: true, install: { platform: "linux" }, art_square: sideArt },
        { app_name: "side2", runner: "sideload", title: "Removed App", is_installed: false },
      ],
      libraries: {
        legendary: [{ app_name: "ubi-game", title: "Ubisoft Game" }],
        gog: [{ app_name: "1207658901", title: "Tyrian 2000", art_logo: "https://images.gog-statics.com/logo.png" }],
        nile: [{ app_name: "amzn1.adg.product.abc", title: "Amazon Game" }],
        zoom: [{ app_name: "42", title: "Zoom Game" }],
      },
    });

    const games = scanHeroic({ home }).games;
    expect(games.map((g) => [g.id, g.title]).sort()).toEqual(
      [
        ["heroic:legendary:ubi-game", "Ubisoft Game"],
        ["heroic:gog:1207658901", "Tyrian 2000"],
        ["heroic:gog:999", "No Title Folder"], // no library entry: named after its folder
        ["heroic:nile:amzn1.adg.product.abc", "Amazon Game"],
        ["heroic:zoom:42", "Zoom Game"],
        ["heroic:sideload:side1", "My App"],
      ].sort(),
    );
    const byId = new Map(games.map((g) => [g.id, g]));
    expect(byId.get("heroic:gog:1207658901")).toMatchObject({
      storeIds: ["gog:1207658901"],
      sizeOnDisk: Math.round(3.37 * 1024 ** 3), // GOG records sizes as text
      heroic: { platform: "windows", artUrls: { logo: "https://images.gog-statics.com/logo.png" } },
    });
    expect(byId.get("heroic:nile:amzn1.adg.product.abc")).toMatchObject({ storeIds: ["amazon:amzn1.adg.product.abc"], sizeOnDisk: 1234 });
    expect(byId.get("heroic:zoom:42")?.storeIds).toEqual(["zoomplatform:42"]);
    expect(byId.get("heroic:sideload:side1")).toMatchObject({ storeIds: [], artwork: { portrait: sideArt } });
  });

  it("maps favorites, the hidden list and custom categories", () => {
    const home = makeTempDir();
    makeHeroicConfig(flatpakHeroic(home), {
      legendaryInstalled: epicGame(),
      gogInstalled: [{ appName: "7", install_path: "/g/Seven" }],
      games: {
        favourites: [{ appName: EPIC_ID, title: "The Long Dark" }, { appName: "gone", title: "Uninstalled" }],
        hidden: [{ appName: "7", title: "Seven" }],
        customCategories: { Survival: [`${EPIC_ID}_legendary`, "old_game_gog"], Empty: [] },
      },
    });
    const result = scanHeroic({ home });
    // Favorites and the hidden list name an app, not a store: they cover it in every store, installed or not.
    const everyStore = (appName: string) => ["legendary", "gog", "nile", "zoom", "sideload"].map((r) => `heroic:${r}:${appName}`);
    expect(result.hiddenInLauncher).toEqual(new Set(everyStore("7")));
    expect(result.collections).toEqual([
      {
        id: "heroic:favorites",
        name: "Favorites",
        source: "heroic",
        kind: "favorites",
        gameIds: new Set([...everyStore(EPIC_ID), ...everyStore("gone")]),
      },
      { id: "heroic:category:Empty", name: "Empty", source: "heroic", kind: "user", gameIds: new Set() },
      {
        id: "heroic:category:Survival",
        name: "Survival",
        source: "heroic",
        kind: "user",
        gameIds: new Set([`heroic:legendary:${EPIC_ID}`, "heroic:gog:old_game"]),
      },
    ]);
  });

  it("warns about unreadable files, and doesn't trust a hidden list it couldn't read", () => {
    const home = makeTempDir();
    const root = makeHeroicConfig(flatpakHeroic(home), { legendaryInstalled: epicGame() });
    writeFile(join(root, "gog_store/installed.json"), "{broken");
    writeFile(join(root, "store/config.json"), "{broken");
    const result = scanHeroic({ home });
    expect(result.games.map((g) => g.title)).toEqual(["The Long Dark"]);
    expect(result.complete).toBe(false);
    expect(result.hiddenListComplete).toBe(false);
    expect(result.warnings).toEqual([
      expect.stringContaining("gog installed games"),
      expect.stringContaining("settings"),
    ]);
  });

  it("still trusts the hidden list when an installed-games list couldn't be read", () => {
    // Hidden entries come from store/config.json alone, so an unreadable installed list can't hide them.
    const home = makeTempDir();
    const root = makeHeroicConfig(flatpakHeroic(home), { games: { hidden: [{ appName: "7" }] } });
    writeFile(join(root, "gog_store/installed.json"), "{broken");
    const result = scanHeroic({ home });
    expect(result).toMatchObject({ complete: false, hiddenListComplete: true });
    expect(result.hiddenInLauncher.has("heroic:gog:7")).toBe(true);
  });

  it("warns about an unreadable library cache, but still keeps every installed game's art", () => {
    const home = makeTempDir();
    const root = makeHeroicConfig(flatpakHeroic(home), { thirdParty: [["ubi-game", "Windows"]] });
    writeFile(join(root, "store_cache/legendary_library.json"), "{half-writ");
    const result = scanHeroic({ home });
    expect(result.games).toEqual([]); // the third-party game has no title without the library
    expect(result.complete).toBe(true); // the installed lists were read, so pruning is safe
    expect(result.warnings).toEqual([expect.stringContaining("Epic library"), expect.stringContaining("Skipped Heroic game ubi-game")]);
    expect(scanLaunchers({ home }).installedHeroicGames).toEqual([{ runner: "legendary", appName: "ubi-game" }]);

    writeFile(join(root, "store_cache/legendary_library.json"), JSON.stringify({ library: [{ app_name: "ubi-game", title: "Ubi" }] }));
    expect(scanHeroic({ home })).toMatchObject({ complete: true, games: [{ title: "Ubi" }] });
  });

  it("warns about an installed game it can't name, and keeps it installed so its art isn't pruned", () => {
    // No legendary_library.json at all (e.g. never refreshed, or cleared on logout): nothing is unreadable.
    const home = makeTempDir();
    makeHeroicConfig(flatpakHeroic(home), { legendaryInstalled: epicGame(), thirdParty: [["ubi-game", "Windows"]] });
    const result = scanHeroic({ home });
    expect(result.games.map((g) => g.title)).toEqual(["The Long Dark"]);
    expect(result.complete).toBe(true);
    expect(result.warnings).toEqual([expect.stringContaining("Skipped Heroic game ubi-game (legendary)")]);
    expect(scanLaunchers({ home }).installedHeroicGames).toEqual([
      { runner: "legendary", appName: EPIC_ID },
      { runner: "legendary", appName: "ubi-game" },
    ]);
  });

  it("reads file:// art with a literal '%' in its name instead of failing the scan", () => {
    const home = makeTempDir();
    const cover = writeFile(join(home, "Pictures/100%.png"));
    makeHeroicConfig(flatpakHeroic(home), {
      sideloaded: [
        { app_name: "s", title: "Sideloaded", is_installed: true, art_square: `file://${cover}` },
        { app_name: "t", title: "Missing Art", is_installed: true, art_square: "file:///nowhere/50%.png" },
      ],
    });
    const byTitle = new Map(scanHeroic({ home }).games.map((g) => [g.title, g.artwork]));
    expect(byTitle.get("Sideloaded")).toEqual({ portrait: cover });
    expect(byTitle.get("Missing Art")).toEqual({});
  });

  it("reads the sideloaded apps file once, so a broken one is reported once", () => {
    const home = makeTempDir();
    const root = makeHeroicConfig(flatpakHeroic(home));
    writeFile(join(root, "sideload_apps/library.json"), "{broken");
    expect(scanHeroic({ home }).warnings).toEqual([expect.stringContaining("sideloaded apps")]);
  });

  it("uses one install and notes the others, and explains a bad Heroic Folder setting", () => {
    const home = makeTempDir();
    makeHeroicConfig(join(home, ".config/heroic"), { legendaryInstalled: epicGame() });
    makeHeroicConfig(flatpakHeroic(home), { gogInstalled: [{ appName: "7", install_path: "/g/Seven" }] });
    const result = scanHeroic({ home });
    expect(result.games.map((g) => g.source + ":" + g.title)).toEqual(["heroic:The Long Dark"]);
    expect(result.warnings).toEqual([expect.stringContaining("Also found Heroic (flatpak)")]);

    expect(scanHeroic({ home, heroicPath: flatpakHeroic(home) }).games.map((g) => g.title)).toEqual(["Seven"]);
    const bad = scanHeroic({ home, heroicPath: join(home, "nowhere") });
    expect(bad).toMatchObject({ found: false, games: [] });
    expect(bad.settingsProblem).toContain("Heroic Folder");
  });

  it("reads sizes as bytes or as the text Heroic writes", () => {
    expect(sizeOf(1234)).toBe(1234);
    expect(sizeOf("1.5 MiB")).toBe(1.5 * 1024 ** 2);
    expect(sizeOf("2 GB")).toBe(2 * 1024 ** 3); // older Heroic labels powers of 1024 "GB"
    expect(sizeOf("1234567")).toBe(1234567);
    expect(sizeOf("3.37")).toBeUndefined(); // probably a truncated "3.37 GiB", not 3 bytes
    expect(sizeOf("512 bytes")).toBe(512);
    expect(sizeOf("0 B")).toBeUndefined();
    expect(sizeOf("big")).toBeUndefined();
    expect(sizeOf(undefined)).toBeUndefined();
  });

  it("encodes app names in the launch URL", () => {
    expect(heroicLaunchUri("sideload", "a b&c")).toBe("heroic://launch?appName=a%20b%26c&runner=sideload");
  });
});

describe("Heroic with other launchers", () => {
  it("merges a game Lutris also has from the same store", () => {
    const home = makeTempDir();
    makeHeroicConfig(flatpakHeroic(home), {
      gogInstalled: [{ appName: "1207658901", install_path: "/g/Tyrian 2000" }],
      libraries: { gog: [{ app_name: "1207658901", title: "Tyrian 2000" }] },
    });
    makeLutrisDb(join(home, ".local/share/lutris"), [
      { id: 1, name: "Tyrian 2000", slug: "tyrian-2000", service: "gog", service_id: "1207658901" },
    ]);
    const scan = scanLibrary({ home, launcherPriority: ["heroic", "lutris", "steam"] });
    expect(scan.games.map((g) => [g.id, g.alternates?.map((a) => a.id)])).toEqual([
      ["heroic:gog:1207658901", ["lutris:1-tyrian-2000"]],
    ]);
    // Downloaded art follows the Heroic copy, whichever launcher is preferred.
    const lutrisFirst = scanLibrary({ home, launcherPriority: ["lutris", "heroic", "steam"] }).games[0]!;
    expect(lutrisFirst.id).toBe("lutris:1-tyrian-2000");
    expect(artKeyFor(lutrisFirst)).toBe("heroic:gog:1207658901");
  });

  it("takes a merged entry's store, platform and runner from one copy, preferred first", () => {
    const home = makeTempDir();
    makeHeroicConfig(flatpakHeroic(home), { gogInstalled: [{ appName: "12", install_path: "/g/Twelve", platform: "linux" }] });
    // No platform in Lutris: Heroic's would describe a different build than the one Lutris launches.
    makeLutrisDb(join(home, ".local/share/lutris"), [
      { id: 1, name: "Twelve", slug: "twelve", service: "gog", service_id: "12", runner: "wine" },
    ]);
    const games = scanLaunchers({ home }).launchers.flatMap((l) => l.games);
    const heroicCopy = games.find((g) => g.source === "heroic")!;
    const lutrisCopy = games.find((g) => g.source === "lutris")!;
    expect(launcherDetails(mergeCopies(lutrisCopy, [heroicCopy]))).toEqual({ source: "lutris", store: "GOG", runner: "wine" });
    expect(launcherDetails(mergeCopies(heroicCopy, [lutrisCopy]))).toEqual({ source: "heroic", store: "GOG", platform: "Linux" });
    // A copy with nothing to say is skipped.
    expect(launcherDetails(mergeCopies({ ...lutrisCopy, lutris: { id: 1, slug: "twelve" } }, [heroicCopy]))).toMatchObject({
      source: "heroic",
    });
  });

  it("shows no Lutris details for a game Steam launches", () => {
    const steam = { id: "steam:7", source: "steam" as const, title: "T", launchUri: "steam://rungameid/7", lastPlayed: 0, keywords: [], storeIds: ["steam:7"], artwork: {} };
    const lutris = { ...steam, id: "lutris:1-t", source: "lutris" as const, launchUri: "lutris:rungameid/1", lutris: { id: 1, slug: "t", runner: "steam", service: "steam" } };
    expect(launcherDetails(steam)).toEqual({ source: "steam" }); // "Launcher: Steam" says it all
    expect(launcherDetails(mergeCopies(steam, [lutris]))).toEqual({ source: "steam" });
    expect(launcherDetails(mergeCopies(lutris, [steam]))).toEqual({ source: "lutris", store: "Steam", runner: "steam" });
  });

  it("asks for the same Heroic art whichever copy is preferred", () => {
    const home = makeTempDir();
    makeHeroicConfig(flatpakHeroic(home), {
      gogInstalled: [{ appName: "12", install_path: "/g/Twelve" }],
      libraries: { gog: [{ app_name: "12", title: "Twelve", art_icon: "https://images.gog-statics.com/i.png" }] },
    });
    const lutrisDir = join(home, ".local/share/lutris");
    makeLutrisDb(lutrisDir, [{ id: 1, name: "Twelve", slug: "twelve", service: "gog", service_id: "12" }]);
    writeFile(join(home, ".local/share/icons/hicolor/128x128/apps/lutris_twelve.png")); // only Lutris has an icon
    const games = scanLaunchers({ home }).launchers.flatMap((l) => l.games);
    const heroicCopy = games.find((g) => g.source === "heroic")!;
    const lutrisCopy = games.find((g) => g.source === "lutris")!;
    const heroicFirst = requestFor(mergeCopies(heroicCopy, [lutrisCopy]), "icon");
    const lutrisFirst = requestFor(mergeCopies(lutrisCopy, [heroicCopy]), "icon");
    expect(heroicFirst).toEqual(lutrisFirst);
    expect(heroicFirst).toMatchObject({ runner: "gog", appName: "12", url: "https://images.gog-statics.com/i.png" });
  });

  it("is skipped when turned off", () => {
    const home = makeTempDir();
    makeHeroicConfig(flatpakHeroic(home), { legendaryInstalled: epicGame() });
    expect(scanLaunchers({ home, enabledLaunchers: ["steam", "lutris"] }).launchers.map((l) => l.launcher)).toEqual(["steam", "lutris"]);
    expect(scanLaunchers({ home }).installedHeroicGames).toEqual([{ runner: "legendary", appName: EPIC_ID }]);
  });
});

describe("Heroic artwork requests", () => {
  function scanned(extra: Parameters<typeof makeHeroicConfig>[1] = {}) {
    const home = makeTempDir();
    const root = makeHeroicConfig(flatpakHeroic(home), {
      legendaryInstalled: epicGame(),
      libraries: { legendary: [{ app_name: EPIC_ID, title: "The Long Dark", art_square: SQUARE, art_cover: COVER }] },
      ...extra,
    });
    return { home, root, game: scanHeroic({ home }).games[0]! };
  }

  it("asks Epic's CDN for HiDPI-sized covers and banners, and uses a banner as the hero", () => {
    const { game } = scanned();
    const owner = { runner: "legendary", appName: EPIC_ID };
    expect(requestFor(game, "portrait")).toEqual({ ...owner, kind: "portrait", url: `${SQUARE}?h=800&resize=1&w=600` });
    expect(requestFor(game, "header")).toEqual({ ...owner, kind: "header", url: `${COVER}?h=720&resize=1&w=1280` });
    expect(requestFor(game, "hero")).toEqual({ ...owner, kind: "hero", url: `${COVER}?h=720&resize=1&w=1280` });
    expect(requestFor(game, "logo")).toBeUndefined(); // Epic has no logo art
    expect(artKeyFor(game)).toBe(`heroic:legendary:${EPIC_ID}`);
    expect(artKeyOf(requestFor(game, "portrait")!)).toBe(artKeyFor(game)); // downloads land where they're looked up
  });

  it("only downloads an icon when Heroic has none", () => {
    const icon = "https://images.gog-statics.com/icon.png";
    const { home, root, game } = scanned({ libraries: { legendary: [{ app_name: EPIC_ID, art_icon: icon }] } });
    expect(requestFor(game, "icon")).toMatchObject({ url: icon });
    writeFile(join(root, "icons", `${EPIC_ID}.png`));
    const withIcon = scanHeroic({ home }).games[0]!;
    expect(withIcon.artwork.icon).toBeDefined();
    expect(requestFor(withIcon, "icon")).toBeUndefined();
  });
});
