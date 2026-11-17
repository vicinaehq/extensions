import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractLargestIcon } from "../src/lib/image/ico";
import { encodePng, isPng, pngSize } from "../src/lib/image/png";
import { buildIco } from "./fixtures/ico";

/** Decode the pixels of a PNG written by encodePng (filter 0 rows). */
function decodeSimplePng(png: Buffer): { width: number; height: number; rgba: Buffer } {
  const { width, height } = pngSize(png)!;
  const idatLen = png.readUInt32BE(33);
  const raw = inflateSync(png.subarray(41, 41 + idatLen));
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) raw.copy(rgba, y * width * 4, y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1));
  return { width, height, rgba };
}

describe("encodePng", () => {
  it("round-trips pixels", () => {
    const rgba = Buffer.from([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 9, 9, 9, 9]);
    const png = encodePng(2, 2, rgba);
    expect(isPng(png)).toBe(true);
    expect(decodeSimplePng(png)).toEqual({ width: 2, height: 2, rgba });
  });

  it("rejects mismatched buffers", () => {
    expect(() => encodePng(2, 2, Buffer.alloc(3))).toThrow();
  });
});

describe("extractLargestIcon", () => {
  it("prefers the largest entry and uses the PNG header's real size", () => {
    const big = encodePng(512, 512, Buffer.alloc(512 * 512 * 4, 0xff));
    const ico = buildIco([{ size: 32, bgra: [1, 2, 3, 255] }, big, { size: 128, bgra: [1, 2, 3, 255] }]);
    const icon = extractLargestIcon(ico)!;
    expect(icon.size).toBe(512);
    expect(icon.png.equals(big)).toBe(true);
  });

  it("converts 32bpp bitmaps to top-down RGBA PNGs", () => {
    const icon = extractLargestIcon(buildIco([{ size: 16, bgra: [10, 20, 30, 200] }, { size: 64, bgra: [10, 20, 30, 200] }]))!;
    expect(icon.size).toBe(64);
    const { width, rgba } = decodeSimplePng(icon.png);
    expect(width).toBe(64);
    expect([...rgba.subarray(0, 4)]).toEqual([30, 20, 10, 200]); // BGRA -> RGBA
    // The marked bottom-up first pixel must land on the last row.
    const lastRow = (64 - 1) * 64 * 4;
    expect([...rgba.subarray(lastRow, lastRow + 4)]).toEqual([255, 0, 0, 255]);
  });

  it.each([40, 124])("reads BI_BITFIELDS bitmaps with a %i-byte header at the right offset", (headerSize) => {
    const icon = extractLargestIcon(buildIco([{ size: 64, bgra: [10, 20, 30, 200], headerSize, bitfields: true }]))!;
    const { rgba } = decodeSimplePng(icon.png);
    expect([...rgba.subarray(0, 4)]).toEqual([30, 20, 10, 200]);
    const lastRow = (64 - 1) * 64 * 4;
    expect([...rgba.subarray(lastRow, lastRow + 4)]).toEqual([255, 0, 0, 255]);
  });

  it("makes alpha-less bitmaps opaque", () => {
    const icon = extractLargestIcon(buildIco([{ size: 4, bgra: [1, 2, 3, 0], marker: false }]))!;
    const { rgba } = decodeSimplePng(icon.png);
    expect(rgba[7]).toBe(255);
  });

  it("rejects non-ico data", () => {
    expect(() => extractLargestIcon(Buffer.from("GIF89a"))).toThrow(/Not an .ico/);
  });
});
