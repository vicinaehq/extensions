/** Test helper that encodes .ico files. */
/** Build an .ico from entries that are either PNG buffers or {size, bgra} 32bpp bitmaps. */
export function buildIco(
  entries: (
    | Buffer
    | { size: number; bgra: [number, number, number, number]; marker?: boolean; headerSize?: number; bitfields?: boolean }
  )[],
): Buffer {
  const images = entries.map((e) => {
    if (Buffer.isBuffer(e)) return { w: 0, h: 0, data: e };
    const { size, bgra, marker = true, headerSize = 40, bitfields = false } = e;
    const header = Buffer.alloc(headerSize);
    header.writeUInt32LE(headerSize, 0);
    if (bitfields) header.writeUInt32LE(3, 16); // BI_BITFIELDS
    header.writeInt32LE(size, 4);
    header.writeInt32LE(size * 2, 8); // doubled for the AND mask
    header.writeUInt16LE(1, 12);
    header.writeUInt16LE(32, 14);
    const pixels = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size; i++) pixels.set(bgra, i * 4);
    // Mark the bottom-left source pixel (first in the bottom-up buffer) so row order can be checked.
    if (marker) pixels.set([0, 0, 255, 255], 0);
    const andMask = Buffer.alloc(Math.ceil(size / 32) * 4 * size);
    // With a plain 40-byte header, BI_BITFIELDS masks follow it; V4/V5 headers carry them inside.
    const masks = bitfields && headerSize === 40 ? Buffer.alloc(12) : Buffer.alloc(0);
    return { w: size % 256, h: size % 256, data: Buffer.concat([header, masks, pixels, andMask]) };
  });
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach((img, i) => {
    const d = 6 + i * 16;
    head[d] = img.w;
    head[d + 1] = img.h;
    head.writeUInt16LE(1, d + 4);
    head.writeUInt16LE(32, d + 6);
    head.writeUInt32LE(img.data.length, d + 8);
    head.writeUInt32LE(offset, d + 12);
    offset += img.data.length;
  });
  return Buffer.concat([head, ...images.map((i) => i.data)]);
}
