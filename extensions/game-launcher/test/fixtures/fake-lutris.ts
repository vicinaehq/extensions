/** Builds a throwaway Lutris data dir (pga.db + artwork) for tests. */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadSqlite } from "../../src/lib/lutris/sqlite";
import { writeFile } from "./fake-steam";

export interface FakeLutrisGame {
  id: number;
  name: string;
  slug: string;
  installer_slug?: string;
  installed?: 0 | 1;
  runner?: string;
  platform?: string;
  directory?: string;
  lastplayed?: number;
  /** Hours, as Lutris stores it. */
  playtime?: number;
  service?: string;
  service_id?: string;
  configpath?: string;
  categories?: string[];
}

/** Create <dataDir>/pga.db with Lutris's schema (the columns we read) and the given games. */
export function makeLutrisDb(dataDir: string, games: FakeLutrisGame[], options: { categoriesTables?: boolean } = {}): string {
  mkdirSync(dataDir, { recursive: true });
  const sqlite = loadSqlite();
  if (!sqlite) throw new Error("node:sqlite unavailable");
  const path = join(dataDir, "pga.db");
  const db = new sqlite.DatabaseSync(path);
  db.exec(`CREATE TABLE games (id INTEGER PRIMARY KEY, name TEXT, sortname TEXT, slug TEXT, installer_slug TEXT,
    parent_slug TEXT, platform TEXT, runner TEXT, executable TEXT, directory TEXT, updated DATETIME, lastplayed INTEGER,
    installed INTEGER, installed_at INTEGER, year INTEGER, configpath TEXT, has_custom_banner INTEGER,
    has_custom_icon INTEGER, has_custom_coverart_big INTEGER, playtime REAL, service TEXT, service_id TEXT, discord_id TEXT)`);
  if (options.categoriesTables !== false) {
    db.exec("CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT UNIQUE)");
    db.exec("CREATE TABLE games_categories (game_id INTEGER, category_id INTEGER)");
  }
  const insert = db.prepare(
    `INSERT INTO games (id, name, slug, installer_slug, installed, runner, platform, directory, lastplayed, playtime, service, service_id, configpath)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const categoryIds = new Map<string, number>();
  for (const g of games) {
    insert.run(
      g.id,
      g.name,
      g.slug,
      g.installer_slug ?? null,
      g.installed ?? 1,
      g.runner ?? null,
      g.platform ?? null,
      g.directory ?? null,
      g.lastplayed ?? null,
      g.playtime ?? null,
      g.service ?? null,
      g.service_id ?? null,
      g.configpath ?? null,
    );
    for (const c of g.categories ?? []) {
      if (!categoryIds.has(c)) {
        categoryIds.set(c, categoryIds.size + 1);
        db.prepare("INSERT INTO categories (id, name) VALUES (?, ?)").run(categoryIds.get(c)!, c);
      }
      db.prepare("INSERT INTO games_categories (game_id, category_id) VALUES (?, ?)").run(g.id, categoryIds.get(c)!);
    }
  }
  db.close();
  return path;
}

export function lutrisArt(dataDir: string, iconDir: string, slug: string, kinds: ("cover" | "banner" | "icon")[]) {
  if (kinds.includes("cover")) writeFile(join(dataDir, "coverart", `${slug}.jpg`));
  if (kinds.includes("banner")) writeFile(join(dataDir, "banners", `${slug}.jpg`));
  if (kinds.includes("icon")) writeFile(join(iconDir, `lutris_${slug}.png`));
}
