/**
 * Minimal reader for Steam's appcache/appinfo.vdf: the client's cache of
 * product info for every app it knows about. We only use it to learn each
 * installed app's type ("game", "tool", "application", ...), which is how
 * Proton, the Steam Linux Runtime, and redistributables get filtered out.
 *
 * File layout (little-endian):
 *   u32 magic      0x07564427 (v27), 0x07564428 (v28), 0x07564429 (v29)
 *   u32 universe
 *   u64 stringTableOffset           (v29 only)
 *   entries...
 *     u32 appid                     (0 terminates the list)
 *     u32 size                      (bytes that follow, to the end of this entry)
 *     u32 infoState, u32 lastUpdated, u64 picsToken, 20B sha1, u32 changeNumber
 *     20B binaryDataSha1            (v28+)
 *     binary KeyValues              (keys inline in v27/v28, string-table indices in v29)
 *   u32 count + count NUL-terminated strings   (v29 string table)
 */

import { BinaryReader, BinaryVdfError, type BinaryVdfObject, readBinaryVdf } from "../vdf/binary";

export const APPINFO_MAGIC_V27 = 0x07564427;
export const APPINFO_MAGIC_V28 = 0x07564428;
export const APPINFO_MAGIC_V29 = 0x07564429;

export interface AppInfo {
  appid: number;
  /** Lower-cased common.type, e.g. "game", "tool", "application", "demo", "config". */
  type?: string;
  name?: string;
  /** Hash of the 32x32 community icon, cached as appcache/librarycache/<appid>/<hash>.jpg. */
  icon?: string;
  /** Hash of the multi-resolution client icon, cached as steam/games/<hash>.ico (only once a shortcut was made). */
  clientIcon?: string;
}

function readStringTable(buf: Buffer, offset: number): string[] {
  const r = new BinaryReader(buf, offset);
  const count = r.u32();
  const table: string[] = new Array(count);
  for (let i = 0; i < count; i++) table[i] = r.cstring();
  return table;
}

function str(obj: BinaryVdfObject | undefined, key: string): string | undefined {
  const v = obj?.[key];
  return typeof v === "string" ? v : undefined;
}

function obj(o: BinaryVdfObject | undefined, key: string): BinaryVdfObject | undefined {
  const v = o?.[key];
  return typeof v === "object" && typeof v !== "bigint" ? v : undefined;
}

/**
 * Parse appinfo.vdf, decoding only the apps in `wanted` (all apps if omitted).
 * Entries we don't want are skipped using their size prefix, so this stays
 * fast even though the file holds thousands of apps.
 */
export function parseAppInfo(buf: Buffer, wanted?: ReadonlySet<number>): Map<number, AppInfo> {
  const r = new BinaryReader(buf);
  const magic = r.u32();
  if (magic !== APPINFO_MAGIC_V27 && magic !== APPINFO_MAGIC_V28 && magic !== APPINFO_MAGIC_V29) {
    throw new BinaryVdfError(`Unsupported appinfo.vdf magic 0x${magic.toString(16)}`, 0);
  }
  r.u32(); // universe

  let stringTable: string[] | undefined;
  if (magic === APPINFO_MAGIC_V29) {
    const tableOffset = Number(r.u64());
    stringTable = readStringTable(buf, tableOffset);
  }
  const headerBytes = magic === APPINFO_MAGIC_V27 ? 40 : 60;

  const result = new Map<number, AppInfo>();
  while (true) {
    const appid = r.u32();
    if (appid === 0) break;
    const size = r.u32();
    const entryEnd = r.offset + size;

    if (wanted && !wanted.has(appid)) {
      r.offset = entryEnd;
      continue;
    }

    r.skip(headerBytes);
    const kv = readBinaryVdf(r, stringTable);
    const common = obj(obj(kv, "appinfo"), "common");
    result.set(appid, {
      appid,
      type: str(common, "type")?.toLowerCase(),
      name: str(common, "name"),
      icon: str(common, "icon"),
      clientIcon: str(common, "clienticon"),
    });
    r.offset = entryEnd;

    if (wanted && result.size === wanted.size) break;
  }
  return result;
}
