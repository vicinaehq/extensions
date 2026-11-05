import type { Transmitter } from "./pcsc";

/**
 * The YubiKey management applet, used for one thing here: reading the key's serial number.
 *
 * The serial is the only stable way to tell two YubiKeys apart. The PC/SC reader name does not
 * carry it (`Yubico YubiKey OTP+FIDO+CCID 00 00` is index and slot, not identity), and the USB
 * descriptor does not expose it either on keys where the OTP interface is not publishing it. So
 * we ask the key itself, which is what `ykman` does.
 *
 * Present on firmware 5.x. On older keys the applet is missing and the SELECT fails; the caller
 * treats that as "serial unknown" rather than an error, and only refuses when the user asked to
 * pin to a specific serial.
 */

const AID = Buffer.from([0xa0, 0x00, 0x00, 0x05, 0x27, 0x47, 0x11, 0x17]);

const INS = {
  SELECT: 0xa4,
  READ_CONFIG: 0x1d,
} as const;

/** DeviceInfo TLV that carries the serial, as a big-endian integer. */
const TAG_SERIAL = 0x02;

const SW_OK = 0x9000;

function apdu(ins: number, p1: number, p2: number, data?: Buffer): Buffer {
  const head = Buffer.from([0x00, ins, p1, p2]);
  if (!data || data.length === 0) return Buffer.concat([head, Buffer.from([0x00])]);
  return Buffer.concat([head, Buffer.from([data.length]), data]);
}

function parseTlvs(buf: Buffer): { tag: number; value: Buffer }[] {
  const out: { tag: number; value: Buffer }[] = [];
  let p = 0;
  while (p + 1 < buf.length) {
    const tag = buf[p++];
    const len = buf[p++];
    out.push({ tag, value: buf.subarray(p, p + len) });
    p += len;
  }
  return out;
}

/**
 * Reads the serial number of the key behind this transmitter.
 *
 * Returns null when the key does not tell us: no management applet, or a device info block with
 * no serial tag (a YubiKey can have the serial disabled in its configuration). Never throws for
 * those cases, because "cannot identify this key" is a decision for the caller to make.
 */
export async function readSerial(t: Transmitter): Promise<number | null> {
  const selectRes = await t(apdu(INS.SELECT, 0x04, 0x00, AID));
  if (readSw(selectRes) !== SW_OK) return null;

  const res = await t(apdu(INS.READ_CONFIG, 0x00, 0x00));
  if (readSw(res) !== SW_OK) return null;

  // The response is a length byte followed by the DeviceInfo TLVs.
  const body = res.subarray(0, -2);
  if (body.length < 2) return null;
  const declared = body[0];
  const tlvs = parseTlvs(body.subarray(1, Math.min(1 + declared, body.length)));

  const serial = tlvs.find((x) => x.tag === TAG_SERIAL);
  if (!serial || serial.value.length === 0 || serial.value.length > 4) return null;
  return serial.value.readUIntBE(0, serial.value.length);
}

function readSw(res: Buffer): number {
  if (res.length < 2) return 0;
  return (res[res.length - 2] << 8) | res[res.length - 1];
}
