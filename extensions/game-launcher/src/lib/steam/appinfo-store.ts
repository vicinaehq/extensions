/**
 * Persistent per-app metadata taken from appinfo.vdf, so the (potentially
 * 100+ MB) file only has to be read when a newly installed game appears, or
 * when entries expire.
 *
 * Only data that is effectively immutable is kept: an app's type never
 * changes, and its icon hashes change rarely, so entries are re-checked
 * against appinfo.vdf after 30 days (the same schedule as cached artwork).
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface StoredAppInfo {
  /** Lower-cased appinfo common.type ("game", "tool", ...). Undefined: appinfo.vdf had no type for the app when checked. */
  type?: string;
  icon?: string;
  clientIcon?: string;
  /** When this entry was last confirmed against appinfo.vdf (ms since epoch). */
  checkedAt: number;
}

const VERSION = 1;
/** Re-check entries against appinfo.vdf after this long, to pick up changed icon hashes. */
export const RECHECK_AFTER_MS = 30 * 24 * 3600 * 1000;
/** Apps appinfo.vdf had no type for are usually just not fetched yet: re-check those daily. */
export const RECHECK_UNKNOWN_AFTER_MS = 24 * 3600 * 1000;

export interface AppInfoStoreOptions {
  now?: () => number;
}

export class AppInfoStore {
  private dirty = false;
  private readonly now: () => number;

  private constructor(
    private readonly path: string | undefined,
    private readonly apps: Map<number, StoredAppInfo>,
    options: AppInfoStoreOptions,
  ) {
    this.now = options.now ?? Date.now;
  }

  /** In-memory store (nothing persisted), e.g. for tests or when no support dir is available. */
  static memory(options: AppInfoStoreOptions = {}): AppInfoStore {
    return new AppInfoStore(undefined, new Map(), options);
  }

  /** Load from disk. A missing, unreadable or incompatible file yields an empty store. */
  static load(path: string, options: AppInfoStoreOptions = {}): AppInfoStore {
    const apps = new Map<number, StoredAppInfo>();
    try {
      const doc = JSON.parse(readFileSync(path, "utf8")) as { version?: number; apps?: Record<string, StoredAppInfo> };
      if (doc.version === VERSION && doc.apps && typeof doc.apps === "object") {
        for (const [id, info] of Object.entries(doc.apps)) {
          // Typed entries are always usable; "unknown" entries only mean something with a check time.
          const valid = typeof info?.type === "string" || (info?.type === undefined && typeof info?.checkedAt === "number");
          if (/^\d+$/.test(id) && valid) {
            apps.set(Number(id), { ...info, checkedAt: typeof info.checkedAt === "number" ? info.checkedAt : 0 });
          }
        }
      }
    } catch {
      // first run or corrupt file: start fresh
    }
    return new AppInfoStore(path, apps, options);
  }

  get(appid: number): StoredAppInfo | undefined {
    return this.apps.get(appid);
  }

  /** Whether the entry exists and was checked against appinfo.vdf recently enough. */
  isFresh(appid: number): boolean {
    const entry = this.apps.get(appid);
    if (!entry) return false;
    return this.now() - entry.checkedAt <= (entry.type ? RECHECK_AFTER_MS : RECHECK_UNKNOWN_AFTER_MS);
  }

  /** Record what appinfo.vdf says about an app (also marks it as freshly checked). */
  set(appid: number, info: Omit<StoredAppInfo, "checkedAt"> & { type: string }): void {
    this.apps.set(appid, { type: info.type, icon: info.icon, clientIcon: info.clientIcon, checkedAt: this.now() });
    this.dirty = true;
  }

  /**
   * Note that appinfo.vdf had nothing (new) for an app. Known info is kept; an
   * app with no info is remembered as unknown so it isn't looked up on every scan.
   */
  markChecked(appid: number): void {
    const prev = this.apps.get(appid);
    this.apps.set(appid, { ...prev, checkedAt: this.now() });
    this.dirty = true;
  }

  /** Drop entries for apps that are no longer installed. */
  retain(appids: ReadonlySet<number>): void {
    for (const id of this.apps.keys()) {
      if (!appids.has(id)) {
        this.apps.delete(id);
        this.dirty = true;
      }
    }
  }

  get size(): number {
    return this.apps.size;
  }

  /** Write to disk if anything changed. Failures are ignored: the store is only an optimisation. */
  save(): void {
    if (!this.path || !this.dirty) return;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify({ version: VERSION, apps: Object.fromEntries(this.apps) }));
      renameSync(tmp, this.path);
      this.dirty = false;
    } catch {
      // read-only or full disk: we'll just read appinfo.vdf again next time
    }
  }
}
