import { existsSync, readdirSync, readFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ArtworkCache, cdnUrl, clientIconUrl, forEachLimit } from "../src/lib/artwork-cache";
import { encodePng } from "../src/lib/image/png";
import { makeTempDir, writeFile } from "./fixtures/fake-steam";
import { buildIco } from "./fixtures/ico";

type Routes = Record<string, { status: number; body?: Buffer; type?: string } | Error>;

function fakeFetch(routes: Routes) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const route = routes[url] ?? { status: 404 };
    if (route instanceof Error) throw route;
    return new Response(route.body ?? null, {
      status: route.status,
      headers: { "content-type": route.type ?? "image/jpeg" },
    });
  }) as typeof fetch;
  return { impl, calls };
}

const ok = (body: string) => ({ status: 200, body: Buffer.from(body) });
const DAY = 24 * 3600 * 1000;

function age(path: string, days: number) {
  const t = new Date(Date.now() - days * DAY);
  utimesSync(path, t, t);
}

describe("ArtworkCache downloads", () => {
  it("prefers the 2x image", async () => {
    const dir = makeTempDir();
    const { impl, calls } = fakeFetch({ [cdnUrl(1, "portrait", "2x")]: ok("cover2x") });
    const cache = new ArtworkCache(dir, { allowNetwork: true, fetch: impl });

    const path = await cache.ensure({ appid: 1, kind: "portrait", hasLocal: true });
    expect(path).toBe(join(dir, "steam/1/portrait@2x.jpg"));
    expect(readFileSync(path!, "utf8")).toBe("cover2x");
    expect(calls).toEqual([cdnUrl(1, "portrait", "2x")]);
    expect(cache.needsFetch({ appid: 1, kind: "portrait", hasLocal: true })).toBe(false);
  });

  it("never downloads the 1x image when the launcher already has a local copy", async () => {
    const dir = makeTempDir();
    const { impl, calls } = fakeFetch({ [cdnUrl(2, "header", "1x")]: ok("header1x") });
    const cache = new ArtworkCache(dir, { allowNetwork: true, fetch: impl });

    expect(await cache.ensure({ appid: 2, kind: "header", hasLocal: true })).toBeUndefined();
    expect(calls).toEqual([cdnUrl(2, "header", "2x")]);
    // Recorded as missing, so it isn't retried every time.
    expect(cache.needsFetch({ appid: 2, kind: "header", hasLocal: true })).toBe(false);
  });

  it("falls back to 1x only when there is no local copy", async () => {
    const dir = makeTempDir();
    const { impl, calls } = fakeFetch({ [cdnUrl(3, "portrait", "1x")]: ok("cover1x") });
    const cache = new ArtworkCache(dir, { allowNetwork: true, fetch: impl });

    const path = await cache.ensure({ appid: 3, kind: "portrait", hasLocal: false });
    expect(path).toBe(join(dir, "steam/3/portrait@1x.jpg"));
    expect(calls).toEqual([cdnUrl(3, "portrait", "2x"), cdnUrl(3, "portrait", "1x")]);
    // If a local copy shows up later (e.g. after viewing the game in Steam), the cached 1x is ignored.
    expect(cache.get({ appid: 3, kind: "portrait", hasLocal: true })).toBeUndefined();
    expect(cache.get({ appid: 3, kind: "portrait", hasLocal: false })).toBe(path);
  });

  it("replaces a cached 1x image once a 2x one is available", async () => {
    const dir = makeTempDir();
    const lo = writeFile(join(dir, "steam/4/portrait@1x.jpg"), "old1x");
    age(lo, 40);
    const { impl } = fakeFetch({ [cdnUrl(4, "portrait", "2x")]: ok("new2x") });
    const cache = new ArtworkCache(dir, { allowNetwork: true, fetch: impl });

    expect(cache.needsFetch({ appid: 4, kind: "portrait" })).toBe(true);
    expect(await cache.ensure({ appid: 4, kind: "portrait" })).toBe(join(dir, "steam/4/portrait@2x.jpg"));
    expect(existsSync(lo)).toBe(false);
  });

  it("keeps a stale 2x image when the refresh 404s, instead of downloading 1x on every open", async () => {
    const dir = makeTempDir();
    const hi = writeFile(join(dir, "steam/15/portrait@2x.jpg"), "old2x");
    age(hi, 40);
    const { impl, calls } = fakeFetch({ [cdnUrl(15, "portrait", "1x")]: ok("1x") });
    const cache = new ArtworkCache(dir, { allowNetwork: true, fetch: impl });

    expect(await cache.ensure({ appid: 15, kind: "portrait", hasLocal: false })).toBe(hi);
    expect(calls).toEqual([cdnUrl(15, "portrait", "2x")]);
    expect(existsSync(join(dir, "steam/15/portrait@1x.jpg"))).toBe(false);
    expect(cache.needsFetch({ appid: 15, kind: "portrait", hasLocal: false })).toBe(false);
  });

  it("remembers 404s for a week, then retries", async () => {
    const dir = makeTempDir();
    let now = Date.now();
    const { impl } = fakeFetch({});
    const cache = new ArtworkCache(dir, { allowNetwork: true, fetch: impl, now: () => now });
    expect(await cache.ensure({ appid: 5, kind: "header" })).toBeUndefined();
    expect(cache.needsFetch({ appid: 5, kind: "header" })).toBe(false);
    now += 8 * DAY;
    expect(cache.needsFetch({ appid: 5, kind: "header" })).toBe(true);
  });

  it("does not record network errors or 5xx as missing", async () => {
    const dir = makeTempDir();
    const { impl } = fakeFetch({
      [cdnUrl(6, "portrait", "2x")]: new Error("offline"),
      [cdnUrl(7, "portrait", "2x")]: { status: 503 },
    });
    const cache = new ArtworkCache(dir, { allowNetwork: true, fetch: impl });
    expect(await cache.ensure({ appid: 6, kind: "portrait" })).toBeUndefined();
    expect(await cache.ensure({ appid: 7, kind: "portrait" })).toBeUndefined();
    expect(cache.needsFetch({ appid: 6, kind: "portrait" })).toBe(true);
    expect(cache.needsFetch({ appid: 7, kind: "portrait" })).toBe(true);
  });

  it("ignores non-image responses (e.g. an HTML error page)", async () => {
    const dir = makeTempDir();
    const { impl } = fakeFetch({ [cdnUrl(8, "portrait", "2x")]: { status: 200, body: Buffer.from("<html>"), type: "text/html" } });
    const cache = new ArtworkCache(dir, { allowNetwork: true, fetch: impl });
    expect(await cache.ensure({ appid: 8, kind: "portrait", hasLocal: true })).toBeUndefined();
  });

  it("refreshes stale files but keeps them if the refresh finds nothing", async () => {
    const dir = makeTempDir();
    const path = writeFile(join(dir, "steam/9/portrait@2x.jpg"), "old");
    age(path, 40);
    const { impl } = fakeFetch({});
    const cache = new ArtworkCache(dir, { allowNetwork: true, fetch: impl });
    expect(cache.needsFetch({ appid: 9, kind: "portrait", hasLocal: true })).toBe(true);
    expect(await cache.ensure({ appid: 9, kind: "portrait", hasLocal: true })).toBe(path);
    expect(readFileSync(path, "utf8")).toBe("old");
    expect(cache.needsFetch({ appid: 9, kind: "portrait", hasLocal: true })).toBe(false);
  });

  it("clears a stale missing marker after a later success", async () => {
    const dir = makeTempDir();
    const marker = writeFile(join(dir, "steam/10/portrait.missing"), "0");
    age(marker, 10);
    const { impl } = fakeFetch({ [cdnUrl(10, "portrait", "2x")]: ok("x") });
    const cache = new ArtworkCache(dir, { allowNetwork: true, fetch: impl });
    await cache.ensure({ appid: 10, kind: "portrait" });
    expect(existsSync(marker)).toBe(false);
  });
});

describe("ArtworkCache icons", () => {
  it("extracts a sharp icon from the client .ico, and skips 32px-only icons", async () => {
    const dir = makeTempDir();
    const sharp = buildIco([{ size: 32, bgra: [0, 0, 0, 255] }, encodePng(256, 256, Buffer.alloc(256 * 256 * 4))]);
    const tiny = buildIco([{ size: 32, bgra: [0, 0, 0, 255] }]);
    const { impl } = fakeFetch({
      [clientIconUrl(11, "aaa")]: { status: 200, body: sharp, type: "image/x-icon" },
      [clientIconUrl(12, "bbb")]: { status: 200, body: tiny, type: "image/x-icon" },
    });
    const cache = new ArtworkCache(dir, { allowNetwork: true, fetch: impl });

    const icon = await cache.ensure({ appid: 11, kind: "icon", clientIcon: "aaa", hasLocal: true });
    expect(icon).toBe(join(dir, "steam/11/icon.png"));
    expect(readFileSync(icon!).subarray(1, 4).toString()).toBe("PNG");

    expect(await cache.ensure({ appid: 12, kind: "icon", clientIcon: "bbb" })).toBeUndefined();
    expect(cache.needsFetch({ appid: 12, kind: "icon", clientIcon: "bbb" })).toBe(false);
    expect(cache.needsFetch({ appid: 13, kind: "icon" })).toBe(false); // no hash, nothing to fetch
  });

  it("uses Steam's local .ico without touching the network when offline", async () => {
    const dir = makeTempDir();
    const localIco = writeFile(join(makeTempDir(), "ccc.ico"), buildIco([{ size: 96, bgra: [1, 1, 1, 255] }]));
    const { impl, calls } = fakeFetch({});
    const cache = new ArtworkCache(dir, { allowNetwork: false, fetch: impl });
    expect(cache.needsFetch({ appid: 14, kind: "portrait" })).toBe(false);
    expect(await cache.ensure({ appid: 14, kind: "icon", clientIcon: "ccc", localIco })).toBe(join(dir, "steam/14/icon.png"));
    expect(calls).toEqual([]);
  });
});

describe("ArtworkCache clear during downloads", () => {
  it("discards downloads that finish after the cache was cleared", async () => {
    const dir = makeTempDir();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const impl = (async () => {
      await gate; // hold the download open until the test clears the cache
      return new Response(Buffer.from("late"), { status: 200, headers: { "content-type": "image/jpeg" } });
    }) as unknown as typeof fetch;
    const cache = new ArtworkCache(dir, { allowNetwork: true, fetch: impl });

    const pending = cache.ensure({ appid: 1, kind: "portrait", hasLocal: true });
    expect(cache.clear()).toEqual({ files: 0, bytes: 0 });
    release();
    expect(await pending).toBeUndefined();
    expect(existsSync(join(dir, "steam/1"))).toBe(false);
    // Downloads started after the clear work normally.
    expect(await cache.ensure({ appid: 1, kind: "portrait", hasLocal: true })).toBe(join(dir, "steam/1/portrait@2x.jpg"));
  });
});

describe("ArtworkCache maintenance", () => {
  function populated() {
    const dir = makeTempDir();
    writeFile(join(dir, "steam/1/portrait@2x.jpg"), "aaaa");
    writeFile(join(dir, "steam/1/icon.png"), "bb");
    writeFile(join(dir, "steam/1/header.missing"), "0");
    writeFile(join(dir, "steam/1/portrait.jpg"), "old layout");
    age(writeFile(join(dir, "steam/1/icon.png.123.tmp"), "stale"), 1);
    writeFile(join(dir, "steam/1/header@2x.jpg.456.tmp"), "in flight");
    writeFile(join(dir, "steam/2/portrait@2x.jpg"), "uninstalled");
    writeFile(join(dir, "steam/junk/file"), "x");
    return { dir, cache: new ArtworkCache(dir, { allowNetwork: false }) };
  }

  it("prunes uninstalled apps, old-layout files and stale temp files", () => {
    const { dir, cache } = populated();
    expect(cache.prune(new Set([1]))).toBe(4);
    expect(readdirSync(join(dir, "steam"))).toEqual(["1"]);
    expect(readdirSync(join(dir, "steam/1")).sort()).toEqual([
      "header.missing",
      "header@2x.jpg.456.tmp",
      "icon.png",
      "portrait@2x.jpg",
    ]);
  });

  it("reports usage (excluding markers) and clears everything", () => {
    const { dir, cache } = populated();
    const usage = cache.usage();
    expect(usage.files).toBe(7);
    expect(usage.bytes).toBe(4 + 2 + 10 + 5 + 9 + 11 + 1);
    expect(cache.clear()).toEqual(usage);
    expect(existsSync(join(dir, "steam"))).toBe(false);
    expect(cache.usage()).toEqual({ files: 0, bytes: 0 });
    expect(cache.prune(new Set())).toBe(0);
  });
});

describe("ArtworkCache URL downloads (Heroic)", () => {
  const GAME = { runner: "gog", appName: "1207658901" };
  const URL_A = "https://images.gog-statics.com/a.png";
  const URL_B = "https://images.gog-statics.com/b.jpg";

  it("downloads the image, named by kind and URL, with an extension from its type", async () => {
    const dir = makeTempDir();
    const { impl, calls } = fakeFetch({ [URL_A]: { status: 200, body: Buffer.from("png!"), type: "image/png" } });
    const cache = new ArtworkCache(dir, { allowNetwork: true, fetch: impl });
    const req = { ...GAME, kind: "portrait" as const, url: URL_A };
    expect(cache.needsFetch(req)).toBe(true);
    const path = await cache.ensure(req);
    expect(path).toMatch(new RegExp(`${join(dir, "heroic/gog/1207658901")}/portrait-[0-9a-f]{16}\\.png$`));
    expect(readFileSync(path!, "utf8")).toBe("png!");
    expect(cache.get(req)).toBe(path);
    // Named after its URL, so it's never re-downloaded; new store art means a new URL.
    expect(cache.needsFetch(req)).toBe(false);
    await cache.ensure(req);
    expect(calls).toEqual([URL_A]);
  });

  it("replaces art from an older URL, and records URLs with no image", async () => {
    const dir = makeTempDir();
    const { impl } = fakeFetch({ [URL_A]: ok("old"), [URL_B]: ok("new") });
    const cache = new ArtworkCache(dir, { allowNetwork: true, fetch: impl });
    const old = await cache.ensure({ ...GAME, kind: "header", url: URL_A });
    const next = await cache.ensure({ ...GAME, kind: "header", url: URL_B });
    expect(existsSync(old!)).toBe(false);
    expect(readFileSync(next!, "utf8")).toBe("new");

    const missing = { ...GAME, kind: "logo" as const, url: "https://images.gog-statics.com/404.png" };
    expect(await cache.ensure(missing)).toBeUndefined();
    expect(cache.needsFetch(missing)).toBe(false); // retried after a week, not on every open

    // A new URL with no image still drops the old URL's art, which nothing would show again.
    const gone = await cache.ensure({ ...GAME, kind: "header", url: "https://images.gog-statics.com/404.png" });
    expect(gone).toBeUndefined();
    expect(existsSync(next!)).toBe(false);
  });

  it("handles a non-image response like a missing image", async () => {
    const dir = makeTempDir();
    const portal = { status: 200, body: Buffer.from("<html>Sign in to Wi-Fi</html>"), type: "text/html" };
    const routes: Routes = { [URL_A]: ok("old") };
    const { impl } = fakeFetch(routes);
    const cache = new ArtworkCache(dir, { allowNetwork: true, fetch: impl });
    const old = await cache.ensure({ ...GAME, kind: "header", url: URL_A });
    routes[URL_B] = portal;
    const req = { ...GAME, kind: "header" as const, url: URL_B };
    expect(await cache.ensure(req)).toBeUndefined();
    expect(cache.needsFetch(req)).toBe(false); // retried after a week, not on every open
    expect(existsSync(old!)).toBe(false); // the old URL's art could never show again
  });

  it("keeps an app named '.' or '..' inside its own folder", async () => {
    const dir = makeTempDir();
    const { impl } = fakeFetch({ [URL_A]: ok("x") });
    const cache = new ArtworkCache(dir, { allowNetwork: true, fetch: impl });
    const odd = { runner: "gog", appName: "..", kind: "portrait" as const, url: URL_A };
    expect(await cache.ensure(odd)).toMatch(new RegExp(`^${join(dir, "heroic/gog/%2E%2E")}/portrait-`));
    expect(cache.pruneHeroic([odd])).toBe(0);
    expect(cache.get(odd)).toBeDefined();
  });

  it("never touches the network when downloads are off", async () => {
    const { impl, calls } = fakeFetch({ [URL_A]: ok("x") });
    const cache = new ArtworkCache(makeTempDir(), { allowNetwork: false, fetch: impl });
    const req = { ...GAME, kind: "portrait" as const, url: URL_A };
    expect(cache.needsFetch(req)).toBe(false);
    expect(await cache.ensure(req)).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("prunes uninstalled Heroic games and counts Heroic art in usage and clear", async () => {
    const dir = makeTempDir();
    const { impl } = fakeFetch({ [URL_A]: ok("1234") });
    const cache = new ArtworkCache(dir, { allowNetwork: true, fetch: impl });
    await cache.ensure({ ...GAME, kind: "portrait", url: URL_A });
    const amazon = { runner: "nile", appName: "amzn1.adg.product.x/y" };
    await cache.ensure({ ...amazon, kind: "portrait", url: URL_A });
    writeFile(join(dir, "heroic/gog/1207658901/junk.txt"));
    expect(cache.usage()).toEqual({ files: 3, bytes: 4 + 4 + 1 });

    expect(cache.pruneHeroic([GAME])).toBe(2); // the Amazon game's folder and the junk file
    expect(readdirSync(join(dir, "heroic/gog/1207658901"))).toEqual([expect.stringMatching(/^portrait-/)]);
    expect(existsSync(join(dir, "heroic/nile"))).toBe(true);
    expect(readdirSync(join(dir, "heroic/nile"))).toEqual([]);
    expect(cache.clear()).toEqual({ files: 1, bytes: 4 });
    expect(existsSync(join(dir, "heroic"))).toBe(false);
  });
});

describe("forEachLimit", () => {
  it("bounds concurrency and processes every item", async () => {
    let active = 0;
    let peak = 0;
    const seen: number[] = [];
    await forEachLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      seen.push(n);
      active--;
    });
    expect(peak).toBe(3);
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
