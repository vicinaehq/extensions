import { describe, expect, it } from "vitest";
import type { Game } from "../src/lib/games";
import { pickArtwork, pickListIcon, resolveViewSettings } from "../src/lib/view-settings";

describe("resolveViewSettings", () => {
  it("defaults to a 5-column cover grid with full labels", () => {
    expect(resolveViewSettings({})).toEqual({
      layout: "grid",
      artwork: "cover",
      columns: 5,
      aspectRatio: "2/3",
      fit: "fill",
      labels: "full",
    });
  });

  it.each([
    ["cover", 5, "2/3", "fill"],
    ["banner", 3, "21/9", "fill"],
    ["hero", 2, "21/9", "fill"],
    ["logo", 4, "16/9", "contain"],
  ] as const)("auto-sizes %s artwork", (artwork, columns, aspectRatio, fit) => {
    expect(resolveViewSettings({ artwork, gridSize: "auto" })).toMatchObject({ artwork, columns, aspectRatio, fit });
  });

  it("honours an explicit grid size and ignores invalid ones", () => {
    expect(resolveViewSettings({ artwork: "banner", gridSize: "7" }).columns).toBe(7);
    expect(resolveViewSettings({ gridSize: "1" }).columns).toBe(5);
    expect(resolveViewSettings({ gridSize: "12" }).columns).toBe(5);
    expect(resolveViewSettings({ gridSize: "nonsense" }).columns).toBe(5);
  });

  it("falls back on unknown enum values", () => {
    expect(resolveViewSettings({ layout: "carousel", artwork: "poster", labels: "huge" })).toMatchObject({
      layout: "grid",
      artwork: "cover",
      labels: "full",
    });
    expect(resolveViewSettings({ layout: "list-detail", labels: "none" })).toMatchObject({ layout: "list-detail", labels: "none" });
  });
});

const game = (artwork: Game["artwork"]): Game => ({
  id: "steam:1",
  source: "steam",
  title: "T",
  launchUri: "steam://rungameid/1",
  lastPlayed: 0,
  keywords: [],
  storeIds: [],
  artwork,
});

describe("pickArtwork", () => {
  it("prefers downloaded hi-res art, then the local copy, then other kinds", () => {
    const g = game({ portrait: "/p.jpg", header: "/h.jpg" });
    expect(pickArtwork(g, "cover", { portrait: "/hires/p.jpg" })).toEqual({ source: "/hires/p.jpg", fallback: "/p.jpg" });
    expect(pickArtwork(g, "cover")).toEqual({ source: "/p.jpg", fallback: "/h.jpg" });
    expect(pickArtwork(g, "banner")).toEqual({ source: "/h.jpg", fallback: "/p.jpg" });
    expect(pickArtwork(game({ portrait: "/p.jpg" }), "hero")).toEqual({ source: "/p.jpg", fallback: undefined });
    expect(pickArtwork(game({}), "cover")).toBeUndefined();
  });

  it("always shows the user's custom art over downloads", () => {
    const g = { ...game({ portrait: "/grid/1p.png", header: "/h.jpg" }), customArtwork: { portrait: "/grid/1p.png" } };
    expect(pickArtwork(g, "cover", { portrait: "/hires/p.jpg" })).toEqual({ source: "/grid/1p.png", fallback: "/hires/p.jpg" });
  });
});

describe("pickListIcon", () => {
  it("uses a sharp icon, then the 32px icon, and never cover art", () => {
    const g = game({ portrait: "/p.jpg", icon: "/32.jpg" });
    expect(pickListIcon(g, { icon: "/hires/icon.png", portrait: "/hires/p.jpg" })).toEqual({
      source: "/hires/icon.png",
      fallback: "/32.jpg",
    });
    expect(pickListIcon(g)).toEqual({ source: "/32.jpg", fallback: undefined });
    expect(pickListIcon(game({ portrait: "/p.jpg" }))).toBeUndefined();
    const custom = { ...game({ icon: "/grid/1_icon.png" }), customArtwork: { icon: "/grid/1_icon.png" } };
    expect(pickListIcon(custom, { icon: "/hires/icon.png" })).toEqual({ source: "/grid/1_icon.png", fallback: "/hires/icon.png" });
  });
});
