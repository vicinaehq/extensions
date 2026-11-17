/**
 * Test helper that encodes appinfo.vdf files, so the reader can be tested
 * against every format version without shipping Steam's real cache.
 */
import { APPINFO_MAGIC_V27, APPINFO_MAGIC_V28, APPINFO_MAGIC_V29 } from "../../src/lib/steam/appinfo";

export type KvValue = string | number | bigint | { [key: string]: KvValue };
export type AppinfoVersion = 27 | 28 | 29;

class Writer {
  private chunks: Buffer[] = [];
  get length() {
    return this.chunks.reduce((n, c) => n + c.length, 0);
  }
  u8(v: number) {
    this.chunks.push(Buffer.from([v]));
  }
  u32(v: number) {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(v);
    this.chunks.push(b);
  }
  i32(v: number) {
    const b = Buffer.alloc(4);
    b.writeInt32LE(v);
    this.chunks.push(b);
  }
  u64(v: bigint) {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(v);
    this.chunks.push(b);
  }
  bytes(b: Buffer) {
    this.chunks.push(b);
  }
  cstring(s: string) {
    this.chunks.push(Buffer.from(s, "utf8"), Buffer.from([0]));
  }
  toBuffer() {
    return Buffer.concat(this.chunks);
  }
}

function encodeKv(obj: { [key: string]: KvValue }, writeKey: (w: Writer, k: string) => void): Buffer {
  const w = new Writer();
  const walk = (o: { [key: string]: KvValue }) => {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string") {
        w.u8(0x01);
        writeKey(w, k);
        w.cstring(v);
      } else if (typeof v === "number") {
        w.u8(0x02);
        writeKey(w, k);
        w.i32(v);
      } else if (typeof v === "bigint") {
        w.u8(0x07);
        writeKey(w, k);
        w.u64(v);
      } else {
        w.u8(0x00);
        writeKey(w, k);
        walk(v);
      }
    }
    w.u8(0x08);
  };
  walk(obj);
  return w.toBuffer();
}

export function writeAppinfo(apps: { appid: number; kv: { [key: string]: KvValue } }[], version: AppinfoVersion): Buffer {
  const magic = version === 27 ? APPINFO_MAGIC_V27 : version === 28 ? APPINFO_MAGIC_V28 : APPINFO_MAGIC_V29;
  const strings: string[] = [];
  const stringIndex = new Map<string, number>();
  const writeKey =
    version === 29
      ? (w: Writer, k: string) => {
          let idx = stringIndex.get(k);
          if (idx === undefined) {
            idx = strings.push(k) - 1;
            stringIndex.set(k, idx);
          }
          w.u32(idx);
        }
      : (w: Writer, k: string) => w.cstring(k);

  const body = new Writer();
  for (const app of apps) {
    const kv = encodeKv(app.kv, writeKey);
    const header = new Writer();
    header.u32(2); // infoState
    header.u32(1700000000); // lastUpdated
    header.u64(0n); // picsToken
    header.bytes(Buffer.alloc(20)); // sha1
    header.u32(123); // changeNumber
    if (version >= 28) header.bytes(Buffer.alloc(20)); // binary data sha1
    const entry = Buffer.concat([header.toBuffer(), kv]);
    body.u32(app.appid);
    body.u32(entry.length);
    body.bytes(entry);
  }
  body.u32(0); // terminator

  const out = new Writer();
  out.u32(magic);
  out.u32(1); // universe
  const headerLen = version === 29 ? 16 : 8;
  if (version === 29) out.u64(BigInt(headerLen + body.length));
  out.bytes(body.toBuffer());
  if (version === 29) {
    out.u32(strings.length);
    for (const s of strings) out.cstring(s);
  }
  return out.toBuffer();
}
