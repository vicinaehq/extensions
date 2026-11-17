import { describe, expect, it } from "vitest";
import { parseAppInfo } from "../src/lib/steam/appinfo";
import { BinaryReader, readBinaryVdf } from "../src/lib/vdf/binary";
import { type AppinfoVersion, type KvValue, writeAppinfo } from "./fixtures/appinfo-writer";

const apps: { appid: number; kv: { [key: string]: KvValue } }[] = [
  {
    appid: 1145350,
    kv: {
      appinfo: {
        appid: 1145350,
        common: { name: "Hades II", type: "Game", icon: "abc123", clienticon: "def456", gameid: 1145350n },
        extended: { developer: "Supergiant Games" },
      },
    },
  },
  {
    appid: 1493710,
    kv: { appinfo: { appid: 1493710, common: { name: "Proton Experimental", type: "Tool" } } },
  },
  {
    appid: 228980,
    kv: { appinfo: { appid: 228980, common: { name: "Steamworks Common Redistributables", type: "Config" } } },
  },
];

describe.each([27, 28, 29] as AppinfoVersion[])("parseAppInfo (v%i)", (version) => {
  const buf = writeAppinfo(apps, version);

  it("reads type, name and icon hashes for every app", () => {
    const info = parseAppInfo(buf);
    expect(info.size).toBe(3);
    expect(info.get(1145350)).toEqual({
      appid: 1145350,
      type: "game",
      name: "Hades II",
      icon: "abc123",
      clientIcon: "def456",
    });
    expect(info.get(1493710)?.type).toBe("tool");
    expect(info.get(228980)?.type).toBe("config");
  });

  it("only decodes the requested apps", () => {
    const info = parseAppInfo(buf, new Set([228980, 999]));
    expect([...info.keys()]).toEqual([228980]);
  });
});

describe("parseAppInfo errors", () => {
  it("rejects unknown magic", () => {
    const buf = Buffer.alloc(16);
    buf.writeUInt32LE(0x07564426, 0);
    expect(() => parseAppInfo(buf)).toThrow(/Unsupported appinfo.vdf magic/);
  });

  it("rejects truncated files", () => {
    const buf = writeAppinfo(apps, 29);
    expect(() => parseAppInfo(buf.subarray(0, 40))).toThrow();
  });
});

describe("readBinaryVdf", () => {
  it("reads inline-key binary KeyValues (shortcuts.vdf style)", () => {
    const buf = Buffer.concat([
      Buffer.from([0x00]), Buffer.from("shortcuts\0"),
      Buffer.from([0x00]), Buffer.from("0\0"),
      Buffer.from([0x01]), Buffer.from("AppName\0"), Buffer.from("My Game\0"),
      Buffer.from([0x02]), Buffer.from("appid\0"), Buffer.from([0xff, 0xff, 0xff, 0xff]),
      Buffer.from([0x08, 0x08, 0x08]),
    ]);
    expect(readBinaryVdf(new BinaryReader(buf))).toEqual({ shortcuts: { 0: { AppName: "My Game", appid: -1 } } });
  });

  it("rejects unknown field types", () => {
    const buf = Buffer.concat([Buffer.from([0x42]), Buffer.from("k\0")]);
    expect(() => readBinaryVdf(new BinaryReader(buf))).toThrow(/Unknown field type 0x42/);
  });
});
