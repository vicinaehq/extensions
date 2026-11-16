/**
 * Extracts the largest image from a Windows .ico file as a PNG.
 *
 * Steam's client icons (`common.clienticon`) are .ico files holding anything
 * from a single 32x32 bitmap to a full 16..512px set. Entries are either
 * embedded PNGs (copied as-is) or 32-bit BGRA DIBs (converted to PNG).
 * Paletted / <32bpp DIBs only appear at tiny sizes and are skipped.
 */
import { encodePng, isPng, pngSize } from "./png";

export interface ExtractedIcon {
  png: Buffer;
  size: number;
}

interface Candidate {
  width: number;
  height: number;
  data: Buffer;
  png: boolean;
}

function readEntries(buf: Buffer): Candidate[] {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) {
    throw new Error("Not an .ico file");
  }
  const count = buf.readUInt16LE(4);
  const out: Candidate[] = [];
  for (let i = 0; i < count; i++) {
    const dir = 6 + i * 16;
    if (dir + 16 > buf.length) break;
    const size = buf.readUInt32LE(dir + 8);
    const offset = buf.readUInt32LE(dir + 12);
    if (offset + size > buf.length || size === 0) continue;
    const data = buf.subarray(offset, offset + size);
    if (isPng(data)) {
      // The directory says 0 (=256) for anything >= 256; the PNG header has the truth.
      const dims = pngSize(data);
      if (dims) out.push({ ...dims, data, png: true });
    } else {
      out.push({ width: buf[dir] || 256, height: buf[dir + 1] || 256, data, png: false });
    }
  }
  return out;
}

/** Convert a 32bpp BI_RGB DIB (as stored in .ico: bottom-up, height doubled for the AND mask) to RGBA. */
function dibToRgba(dib: Buffer): { width: number; height: number; rgba: Buffer } | undefined {
  if (dib.length < 40) return undefined;
  const headerSize = dib.readUInt32LE(0);
  const width = dib.readInt32LE(4);
  const height = Math.abs(dib.readInt32LE(8)) / 2;
  const bitCount = dib.readUInt16LE(14);
  const compression = dib.readUInt32LE(16);
  if (bitCount !== 32 || (compression !== 0 && compression !== 3) || width <= 0 || height <= 0) return undefined;
  // BI_BITFIELDS colour masks follow a 40-byte BITMAPINFOHEADER; V4/V5 headers already contain them.
  const pixels = headerSize + (compression === 3 && headerSize === 40 ? 12 : 0);
  const stride = width * 4;
  if (pixels + stride * height > dib.length) return undefined;

  const rgba = Buffer.alloc(width * height * 4);
  let anyAlpha = false;
  for (let y = 0; y < height; y++) {
    const src = pixels + (height - 1 - y) * stride; // bottom-up
    for (let x = 0; x < width; x++) {
      const s = src + x * 4;
      const d = (y * width + x) * 4;
      rgba[d] = dib[s + 2]!;
      rgba[d + 1] = dib[s + 1]!;
      rgba[d + 2] = dib[s]!;
      rgba[d + 3] = dib[s + 3]!;
      if (dib[s + 3]) anyAlpha = true;
    }
  }
  // Some 32bpp icons leave alpha at zero and rely on the AND mask; treat them as opaque.
  if (!anyAlpha) for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  return { width, height, rgba };
}

export function extractLargestIcon(buf: Buffer): ExtractedIcon | undefined {
  const entries = readEntries(buf).sort((a, b) => b.width * b.height - a.width * a.height || Number(b.png) - Number(a.png));
  for (const e of entries) {
    if (e.png) return { png: e.data, size: Math.min(e.width, e.height) };
    const dib = dibToRgba(e.data);
    if (dib) return { png: encodePng(dib.width, dib.height, dib.rgba), size: Math.min(dib.width, dib.height) };
  }
  return undefined;
}
