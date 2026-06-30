import { execFileSync, spawn } from "child_process";
import { existsSync, mkdtempSync, copyFileSync, rmSync, readdirSync, lstatSync } from "fs";
import { join, basename } from "path";
import { tmpdir, homedir } from "os";

export type Preferences = { zenCommand?: string; profilesDirectory?: string; profileDirectorySuffix?: string; searchEngine?: string; limitResults?: string };
export type Entry = { title: string; url: string; subtitle?: string; date?: string };
export type Workspace = { id: string; name: string; icon?: string };
export const defaultCommand = "flatpak run app.zen_browser.zen";
export function expandHome(path: string): string { return path.replace(/^~(?=$|\/)/, homedir()); }
export function splitCommand(command: string): string[] { return command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map(s => s.replace(/^['"]|['"]$/g, "")) || []; }
export function zenCommand(p?: Preferences): string[] { return splitCommand(p?.zenCommand || defaultCommand); }
export function runZen(args: string[], p?: Preferences): void { const [cmd, ...base] = zenCommand(p); const child = spawn(cmd, [...base, ...args], { detached: true, stdio: "ignore" }); child.unref(); }
export function searchUrl(query: string, engine = "google"): string {
  const q = encodeURIComponent(query);
  const map: Record<string, string> = { google: `https://www.google.com/search?q=${q}`, duckduckgo: `https://duckduckgo.com/?q=${q}`, bing: `https://www.bing.com/search?q=${q}`, brave: `https://search.brave.com/search?q=${q}`, kagi: `https://kagi.com/search?q=${q}`, qwant: `https://www.qwant.com/?q=${q}`, baidu: `https://www.baidu.com/s?wd=${q}` };
  return map[engine] || map.google;
}
export function normalizeUrlOrSearch(text: string, engine = "google"): string { const s = text.trim(); if (!s) return "about:newtab"; if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s; if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(s)) return `https://${s}`; return searchUrl(s, engine); }
export function profileRoot(p?: Preferences): string { return expandHome(p?.profilesDirectory || "~/.var/app/app.zen_browser.zen/.zen"); }
export function findProfileDir(p?: Preferences): string | null {
  const root = profileRoot(p); if (!existsSync(root)) return null; const suffix = p?.profileDirectorySuffix || "Default (release)";
  const dirs = readdirSync(root).map(n => join(root, n)).filter(x => { try { return lstatSync(x).isDirectory(); } catch { return false; } });
  return dirs.find(d => basename(d).endsWith(suffix)) || dirs.find(d => existsSync(join(d, "places.sqlite"))) || null;
}
function sqlEscape(s: string): string { return s.replace(/'/g, "''"); }
function queryPlaces<T>(profile: string, sql: string, parse: (cols: string[]) => T): T[] {
  const db = join(profile, "places.sqlite"); if (!existsSync(db)) return [];
  const dir = mkdtempSync(join(tmpdir(), "zen-places-")); const copy = join(dir, "places.sqlite");
  try { copyFileSync(db, copy); const out = execFileSync("sqlite3", ["-separator", "\t", copy, sql], { encoding: "utf8", timeout: 10000 }); return out.split(/\n/).filter(Boolean).map(l => parse(l.split("\t"))); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
export function searchHistory(term: string, p?: Preferences): Entry[] { const profile = findProfileDir(p); if (!profile) return []; const like = `%${sqlEscape(term)}%`; const limit = Number(p?.limitResults || 50); return queryPlaces(profile, `select coalesce(title,url), url, datetime(last_visit_date/1000000,'unixepoch') from moz_places where url not like 'place:%' and (title like '${like}' or url like '${like}') order by last_visit_date desc limit ${limit};`, c => ({ title: c[0] || c[1], url: c[1], date: c[2], subtitle: c[1] })); }
export function searchBookmarks(term: string, p?: Preferences): Entry[] { const profile = findProfileDir(p); if (!profile) return []; const like = `%${sqlEscape(term)}%`; const limit = Number(p?.limitResults || 50); return queryPlaces(profile, `select coalesce(b.title,p.title,p.url), p.url from moz_bookmarks b join moz_places p on b.fk=p.id where b.type=1 and (b.title like '${like}' or p.title like '${like}' or p.url like '${like}') order by b.dateAdded desc limit ${limit};`, c => ({ title: c[0] || c[1], url: c[1], subtitle: c[1] })); }
export function listWorkspaces(p?: Preferences): Workspace[] { const profile = findProfileDir(p); if (!profile) return []; return queryPlaces(profile, `select id, name, icon from zen_workspaces order by rowid;`, c => ({ id: c[0], name: c[1] || c[0], icon: c[2] })); }
export function listZenWindows(): { id: string; title: string }[] { const out = execFileSync("wmctrl", ["-lx"], { encoding: "utf8", timeout: 3000 }); return out.split(/\n/).filter(l => /\bzen\b|zen-browser|app\.zen_browser/i.test(l)).map(l => { const parts = l.trim().split(/\s+/); return { id: parts[0], title: parts.slice(4).join(" ") || "Zen Browser" }; }); }
export function focusWindow(id: string): void { execFileSync("wmctrl", ["-ia", id], { timeout: 3000 }); }
