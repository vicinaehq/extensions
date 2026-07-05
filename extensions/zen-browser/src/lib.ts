import { execFileSync, spawn } from "child_process";
import { existsSync, mkdtempSync, copyFileSync, rmSync, readdirSync, lstatSync, readFileSync, writeFileSync } from "fs";
import { join, basename, extname } from "path";
import { tmpdir, homedir } from "os";

export type Preferences = { zenCommand?: string; profilesDirectory?: string; profileDirectorySuffix?: string; searchEngine?: string; limitResults?: string };
export type Entry = { title: string; url: string; subtitle?: string; date?: string; essential?: boolean };
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
function selectedTabEntry(tab: any): { title: string; url: string; essential: boolean } | null {
  const entries = Array.isArray(tab?.entries) ? tab.entries : [];
  const index = Math.max(0, Math.min(entries.length - 1, Number(tab?.index || entries.length) - 1));
  const entry = entries[index]; const url = String(entry?.url || ""); if (!url || url.startsWith("about:")) return null;
  return { title: String(entry?.title || url), url, essential: tab?.zenEssential === true };
}
function pinnedFromSession(session: any): Entry[] {
  const windows = Array.isArray(session?.windows) ? session.windows : [];
  return windows.flatMap((w: any) => Array.isArray(w?.tabs) ? w.tabs : []).filter((t: any) => t?.pinned).map(selectedTabEntry).filter((e: any): e is { title: string; url: string; essential: boolean } => Boolean(e)).map(e => ({ title: e.title, url: e.url, subtitle: e.url, essential: e.essential }));
}
function readPinnedTabsFile(path: string): Entry[] {
  if (extname(path) === ".json") return pinnedFromSession(JSON.parse(readFileSync(path, "utf8")));
  const script = `import json,lz4.block,sys\np=sys.argv[1]\nb=open(p,'rb').read()\nb=b[8:] if b.startswith(b'mozLz40\\0') else b\ndata=json.loads(lz4.block.decompress(b).decode('utf-8'))\nout=[]\nfor w in data.get('windows',[]):\n  for t in w.get('tabs',[]):\n    if not t.get('pinned'):\n      continue\n    entries=t.get('entries') or []\n    if not entries:\n      continue\n    idx=max(0,min(len(entries)-1,int(t.get('index') or len(entries))-1))\n    e=entries[idx]\n    url=str(e.get('url') or '')\n    if not url or url.startswith('about:'):\n      continue\n    title=str(e.get('title') or url)\n    out.append({'title':title,'url':url,'subtitle':url,'essential':bool(t.get('zenEssential'))})\nprint(json.dumps(out))`;
  return JSON.parse(execFileSync("python3", ["-c", script, path], { encoding: "utf8", timeout: 10000, maxBuffer: 1024 * 1024 }));
}
export function listPinnedTabs(p?: Preferences): Entry[] {
  const profile = findProfileDir(p); if (!profile) return [];
  const backups = join(profile, "sessionstore-backups");
  const candidates = [join(backups, "recovery.jsonlz4"), join(backups, "recovery.json"), join(backups, "previous.jsonlz4"), join(backups, "previous.json")];
  const sessionPath = candidates.find(existsSync); if (!sessionPath) return [];
  return readPinnedTabsFile(sessionPath);
}
export function isZenRunning(): boolean { try { execFileSync("pgrep", ["-f", "(^|/)zen( |$)|app\\.zen_browser\\.zen"], { timeout: 3000 }); return true; } catch { return false; } }
export function focusZenWayland(): void {
  const plugin = "pi-focus-zen-browser";
  const scriptPath = join(tmpdir(), `${plugin}.js`);
  writeFileSync(scriptPath, `
function S(v) { try { return String(v || ''); } catch (e) { return ''; } }
function listWindows() { try { if (workspace.windowList) return workspace.windowList(); } catch (e) {} try { if (workspace.clientList) return workspace.clientList(); } catch (e) {} return []; }
function isZen(w) { const hay = [w.caption, w.resourceClass, w.resourceName, w.desktopFileName, w.windowClass, w.appId].map(S).join(' ').toLowerCase(); return hay.indexOf('app.zen_browser.zen') !== -1 || hay.indexOf('zen browser') !== -1 || hay.indexOf(' zen ') !== -1; }
let list = listWindows();
for (let i = 0; i < list.length; i++) {
  let w = list[i];
  if (isZen(w)) {
    try { if (workspace.raiseWindow) workspace.raiseWindow(w); } catch (e) {}
    try { workspace.activeWindow = w; } catch (e) {}
    break;
  }
}
`);
  execFileSync("qdbus", ["org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.unloadScript", plugin], { timeout: 3000, stdio: "ignore" });
  execFileSync("qdbus", ["org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.loadScript", scriptPath, plugin], { timeout: 3000, stdio: "ignore" });
  execFileSync("qdbus", ["org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.start"], { timeout: 3000, stdio: "ignore" });
}
export function listZenWindows(): { id: string; title: string }[] { const out = execFileSync("wmctrl", ["-lx"], { encoding: "utf8", timeout: 3000 }); const windows = out.split(/\n/).filter(l => /\bzen\b|zen-browser|app\.zen_browser/i.test(l)).map(l => { const parts = l.trim().split(/\s+/); return { id: parts[0], title: parts.slice(4).join(" ") || "Zen Browser" }; }); return windows.length ? windows : (isZenRunning() ? [{ id: "wayland-running", title: "Zen Browser (Wayland)" }] : []); }
export function focusWindow(id: string): void { if (id === "wayland-running") return focusZenWayland(); execFileSync("wmctrl", ["-ia", id], { timeout: 3000 }); }
