import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatBytes, formatLastPlayed, formatPlaytime, markdownUrl } from "../src/lib/format";
import { acronyms, compareGames, type Game } from "../src/lib/games";
import type { LauncherScan } from "../src/lib/games";
import { emptyStateText, type LibraryScan } from "../src/lib/library";
import { findSteamInstalls } from "../src/lib/steam/paths";
import { makeTempDir } from "./fixtures/fake-steam";

describe("findSteamInstalls", () => {
  it("finds native and Flatpak installs and de-duplicates symlinks", () => {
    const home = makeTempDir();
    const native = join(home, ".local/share/Steam");
    mkdirSync(join(native, "steamapps"), { recursive: true });
    mkdirSync(join(home, ".steam"), { recursive: true });
    symlinkSync(native, join(home, ".steam/steam"));
    const flatpak = join(home, ".var/app/com.valvesoftware.Steam/.local/share/Steam");
    mkdirSync(join(flatpak, "steamapps"), { recursive: true });

    const installs = findSteamInstalls({ home });
    expect(installs.map((i) => i.kind)).toEqual(["native", "flatpak"]);
  });

  it("puts a configured override first", () => {
    const home = makeTempDir();
    const custom = makeTempDir();
    mkdirSync(join(custom, "steamapps"));
    expect(findSteamInstalls({ home, override: ` ${custom} ` })).toEqual([{ root: custom, kind: "custom" }]);
  });

  it("uses only the override, even when another install would be detected", () => {
    const home = makeTempDir();
    mkdirSync(join(home, ".local/share/Steam/steamapps"), { recursive: true });
    const custom = makeTempDir();
    mkdirSync(join(custom, "steamapps"));
    expect(findSteamInstalls({ home, override: custom })).toEqual([{ root: custom, kind: "custom" }]);
    // An invalid override finds nothing rather than silently falling back to detection.
    expect(findSteamInstalls({ home, override: join(custom, "nope") })).toEqual([]);
  });

  it("ignores directories that aren't Steam installs", () => {
    const home = makeTempDir();
    mkdirSync(join(home, ".local/share/Steam"), { recursive: true });
    expect(findSteamInstalls({ home })).toEqual([]);
  });
});

describe("acronyms", () => {
  it.each([
    ["Kingdom Come: Deliverance II", ["kcdii", "kcd"]],
    ["The Elder Scrolls V: Skyrim", ["tesvs", "tess"]],
    ["Hades II", ["hii"]],
    ["Wartales", []],
    ["Baldur's Gate 3", ["bg3", "bg"]],
  ])("%s -> %j", (title, expected) => {
    expect(acronyms(title)).toEqual(expected);
  });
});

describe("compareGames", () => {
  const g = (title: string, lastPlayed: number) => ({ title, lastPlayed }) as Game;
  it("sorts by most recently played, then title", () => {
    const sorted = [g("b", 0), g("Game 10", 5), g("a", 0), g("Game 2", 5), g("z", 9)].sort(compareGames);
    expect(sorted.map((x) => x.title)).toEqual(["z", "Game 2", "Game 10", "a", "b"]);
  });
});

describe("format", () => {
  const now = 1_800_000_000;
  it.each([
    [0, "Never played"],
    [now - 10, "Played just now"],
    [now - 60, "Played 1 minute ago"],
    [now - 3 * 3600, "Played 3 hours ago"],
    [now - 30 * 3600, "Played yesterday"],
    [now - 12 * 86400, "Played 12 days ago"],
  ])("formatLastPlayed(%i)", (ts, expected) => {
    expect(formatLastPlayed(ts, now)).toBe(expected);
  });

  it("formats old dates as month and year", () => {
    expect(formatLastPlayed(now - 400 * 86400, now)).toMatch(/^Played \w+ \d{4}$/);
  });

  it("formats playtime and sizes", () => {
    expect(formatPlaytime(undefined)).toBeUndefined();
    expect(formatPlaytime(1)).toBe("1 minute");
    expect(formatPlaytime(59)).toBe("59 minutes");
    expect(formatPlaytime(60)).toBe("1 hour");
    expect(formatPlaytime(90)).toBe("1.5 hours");
    expect(formatPlaytime(120)).toBe("2 hours");
    expect(formatPlaytime(594)).toBe("9.9 hours");
    expect(formatPlaytime(599)).toBe("10 hours");
    expect(formatPlaytime(516)).toBe("8.6 hours");
    expect(formatPlaytime(15120)).toBe("252 hours");
    expect(formatBytes(11774185682)).toBe("11 GB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
});

describe("scanLibrary completeness", () => {
  it("never reports a scan with a bad Steam path as complete (so the artwork cache isn't pruned)", async () => {
    const { scanLibrary } = await import("../src/lib/library");
    const result = scanLibrary({ steamPath: join(makeTempDir(), "not-steam"), home: makeTempDir() });
    expect(result.steamComplete).toBe(false);
    expect(result.settingsProblems).toEqual([expect.stringMatching(/doesn't point at a Steam install.*not-steam$/)]);
  });

  it("doesn't scan disabled launchers at all", async () => {
    const { scanLibrary } = await import("../src/lib/library");
    const result = scanLibrary({ enabledLaunchers: ["lutris"], steamPath: "/nope", home: makeTempDir() });
    expect(result.launchers.map((l) => l.launcher)).toEqual(["lutris"]);
    expect(result.steamComplete).toBe(false); // so Steam caches are never pruned while Steam is off
    expect(result.settingsProblems).toEqual([]); // the Steam setting isn't even looked at
  });
});

describe("emptyStateText", () => {
  const launcher = (over: Partial<LauncherScan> & Pick<LauncherScan, "launcher">): LauncherScan => ({
    found: false,
    sources: [],
    games: [],
    collections: [],
    hiddenInLauncher: new Set(),
    hiddenListComplete: false,
    complete: false,
    warnings: [],
    ...over,
  });
  const scan = (launchers: LauncherScan[], over: Partial<LibraryScan> = {}): LibraryScan => ({
    games: [],
    launchers,
    priority: ["steam", "lutris"],
    enabledLaunchers: launchers.map((l) => l.launcher),
    warnings: launchers.flatMap((l) => l.warnings),
    sources: launchers.flatMap((l) => l.sources),
    settingsProblems: launchers.flatMap((l) => (l.settingsProblem ? [l.settingsProblem] : [])),
    collections: [],
    hiddenInLauncher: new Set(),
    hiddenListsComplete: new Set(),
    installedSteamAppids: new Set(),
    steamComplete: false,
    ...over,
  });

  it("says when every launcher is turned off", () => {
    expect(emptyStateText(scan([])).title).toBe("All launchers are turned off");
  });

  it("explains a single missing launcher", () => {
    const t = emptyStateText(scan([launcher({ launcher: "steam" })]));
    expect(t.title).toBe("No Steam install found");
    expect(t.description).toMatch(/^Steam: not found in the usual native, Flatpak and Snap locations\./);
  });

  it("lists each launcher when none was found, and blames a bad folder setting", () => {
    const t = emptyStateText(
      scan([
        launcher({ launcher: "steam", settingsProblem: "The Steam Folder setting doesn't point at a Steam install: /nope" }),
        launcher({ launcher: "lutris" }),
      ]),
    );
    expect(t.title).toBe("No game launchers found");
    expect(t.description).toBe(
      "The Steam Folder setting doesn't point at a Steam install: /nope\n" +
        "Lutris: not found in the usual native and Flatpak locations.\n\nFix it in Settings (Ctrl+,).",
    );
  });

  it("lists where it looked, plus any problems, when launchers have no games", () => {
    const t = emptyStateText(
      scan([
        launcher({
          launcher: "steam",
          found: true,
          sources: ["Steam (native): /home/u/.local/share/Steam"],
          warnings: ["Steam library folder not found: /mnt/games"],
        }),
        launcher({ launcher: "lutris", settingsProblem: "Bad Lutris setting" }),
      ]),
    );
    expect(t.title).toBe("No games found");
    expect(t.description).toBe(
      "Looked in:\n• Steam (native): /home/u/.local/share/Steam\n\nBad Lutris setting\n\nSteam library folder not found: /mnt/games",
    );
  });
});

describe("markdownUrl", () => {
  it("percent-encodes characters that would break a Markdown link", () => {
    expect(markdownUrl("/mnt/Games (SSD)/Steam/a#b?c.jpg")).toBe("file:///mnt/Games%20%28SSD%29/Steam/a%23b%3Fc.jpg");
    expect(markdownUrl("/home/u/it's!.png")).toBe("file:///home/u/it%27s%21.png");
    expect(markdownUrl("https://cdn.example/a(1).jpg")).toBe("https://cdn.example/a%281%29.jpg");
  });
});
