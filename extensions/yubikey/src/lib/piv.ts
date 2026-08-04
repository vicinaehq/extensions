import { X509Certificate } from "node:crypto";
import { gunzipSync } from "node:zlib";
import type { Transmitter } from "./pcsc";

/**
 * The YubiKey's PIV applet, spoken directly over APDU.
 *
 * Read-only for now: list slots, read certificates, check the PIN retries. Writing (generate a
 * key, import one, delete a cert) requires the management key, whose negotiation (3DES/AES
 * challenge-response, with the PIN-protected key living in another object) is left for later.
 */

const AID = Buffer.from([0xa0, 0x00, 0x00, 0x03, 0x08]);

const INS = {
  VERIFY: 0x20,
  GET_DATA: 0xcb,
  GET_METADATA: 0xf7,
} as const;

const TAG = {
  OBJ_DATA: 0x53,
  OBJ_ID: 0x5c,
  CERTIFICATE: 0x70,
  CERT_INFO: 0x71,
  METADATA_RETRIES: 0x06,
} as const;

const PIN_P2 = 0x80;
const PIN_LEN = 8;

/** Slot → readable name and the id of the object holding that slot's certificate. */
export const SLOTS = [
  { slot: "9a", name: "AUTHENTICATION", label: "Authentication", objectId: 0x5fc105 },
  { slot: "9c", name: "SIGNATURE", label: "Digital signature", objectId: 0x5fc10a },
  { slot: "9d", name: "KEY_MANAGEMENT", label: "Key management", objectId: 0x5fc10b },
  { slot: "9e", name: "CARD_AUTH", label: "Card authentication", objectId: 0x5fc101 },
] as const;

const SW = {
  OK: 0x9000,
  FILE_NOT_FOUND: 0x6a82,
  AUTH_BLOCKED: 0x6983,
} as const;

export class PivError extends Error {
  constructor(
    readonly code: "pin_invalid" | "pin_blocked" | "no_cert" | "card",
    message: string,
    readonly retriesLeft?: number,
  ) {
    super(message);
    this.name = "PivError";
  }
}

// ---------------------------------------------------------------------------
// TLV and APDU (PIV uses TLV with a potentially long length)
// ---------------------------------------------------------------------------

function tlv(tag: number, value: Buffer): Buffer {
  if (value.length < 0x80) return Buffer.concat([Buffer.from([tag, value.length]), value]);
  const lenBytes: number[] = [];
  let len = value.length;
  while (len > 0) {
    lenBytes.unshift(len & 0xff);
    len >>= 8;
  }
  return Buffer.concat([Buffer.from([tag, 0x80 | lenBytes.length]), Buffer.from(lenBytes), value]);
}

type Tlv = { tag: number; value: Buffer };

function parseTlvs(buf: Buffer): Tlv[] {
  const out: Tlv[] = [];
  let p = 0;
  while (p < buf.length) {
    const tag = buf[p++];
    if (p >= buf.length) break;
    let len = buf[p++];
    if (len & 0x80) {
      const n = len & 0x7f;
      len = 0;
      for (let i = 0; i < n; i++) len = (len << 8) | buf[p++];
    }
    out.push({ tag, value: buf.subarray(p, p + len) });
    p += len;
  }
  return out;
}

function apdu(ins: number, p1: number, p2: number, data?: Buffer): Buffer {
  const head = Buffer.from([0x00, ins, p1, p2]);
  if (!data || data.length === 0) return Buffer.concat([head, Buffer.from([0x00])]);
  return Buffer.concat([head, Buffer.from([data.length]), data]);
}

/** Sends an APDU and joins the continuations (SW1=0x61). Returns the data without the status. */
async function send(t: Transmitter, cmd: Buffer): Promise<{ data: Buffer; sw: number }> {
  let res = await t(cmd);
  const chunks: Buffer[] = [];
  for (;;) {
    const sw1 = res[res.length - 2];
    const sw2 = res[res.length - 1];
    chunks.push(res.subarray(0, -2));
    if (sw1 === 0x61) {
      // PIV's GET RESPONSE: 00 C0 00 00 <len>
      res = await t(Buffer.from([0x00, 0xc0, 0x00, 0x00, sw2]));
      continue;
    }
    return { data: Buffer.concat(chunks), sw: (sw1 << 8) | sw2 };
  }
}

/** Turns a VERIFY's SW into how many retries are left (0x63CX = X retries). */
function retriesFromSw(sw: number): number | null {
  if (sw === SW.AUTH_BLOCKED) return 0;
  if ((sw & 0xfff0) === 0x63c0) return sw & 0x0f;
  if ((sw & 0xff00) === 0x6300) return sw & 0xff;
  return null;
}

function intToBytes(n: number): Buffer {
  const out: number[] = [];
  do {
    out.unshift(n & 0xff);
    n >>= 8;
  } while (n > 0);
  return Buffer.from(out);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export type CertInfo = {
  subject: string;
  issuer: string;
  notBefore: number;
  notAfter: number;
  serial: string;
  fingerprint: string;
};

export type SlotInfo = {
  slot: string;
  slotName: string;
  label: string;
  hasCert: boolean;
  cert?: CertInfo;
};

export type PivInfo = {
  slots: SlotInfo[];
  pinRetries: number | null;
  pinTotal: number | null;
};

/** Selects the PIV applet. Done at the start of every transaction. */
export async function select(t: Transmitter): Promise<void> {
  const { sw } = await send(t, apdu(0xa4, 0x04, 0x00, AID));
  if (sw !== SW.OK) throw new PivError("card", `Could not select PIV (SW=0x${sw.toString(16)})`);
}

/** Reads a slot's certificate, or null if the slot is empty. */
export async function getCertificate(t: Transmitter, objectId: number): Promise<CertInfo | null> {
  const { data, sw } = await send(t, apdu(INS.GET_DATA, 0x3f, 0xff, tlv(TAG.OBJ_ID, intToBytes(objectId))));
  if (sw === SW.FILE_NOT_FOUND) return null;
  if (sw !== SW.OK) throw new PivError("card", `Could not read the certificate (SW=0x${sw.toString(16)})`);

  // The response is 0x53 { 0x70 <cert> 0x71 <certInfo> }.
  const outer = parseTlvs(data).find((x) => x.tag === TAG.OBJ_DATA);
  if (!outer) return null;
  const inner = parseTlvs(outer.value);
  const certTlv = inner.find((x) => x.tag === TAG.CERTIFICATE);
  const infoTlv = inner.find((x) => x.tag === TAG.CERT_INFO);
  if (!certTlv) return null;

  let der = certTlv.value;
  const certInfo = infoTlv && infoTlv.value.length > 0 ? infoTlv.value[0] : 0;
  if (certInfo === 1) der = gunzipSync(der); // compressed certificate

  const x = new X509Certificate(der);
  return {
    subject: x.subject.replace(/\n/g, ", "),
    issuer: x.issuer.replace(/\n/g, ", "),
    notBefore: Math.floor(new Date(x.validFrom).getTime() / 1000),
    notAfter: Math.floor(new Date(x.validTo).getTime() / 1000),
    serial: x.serialNumber,
    fingerprint: x.fingerprint256.replace(/:/g, "").toLowerCase(),
  };
}

/** Exports a slot's certificate as PEM, or throws if the slot is empty. */
export async function exportCertificate(t: Transmitter, objectId: number): Promise<string> {
  const { data, sw } = await send(t, apdu(INS.GET_DATA, 0x3f, 0xff, tlv(TAG.OBJ_ID, intToBytes(objectId))));
  if (sw === SW.FILE_NOT_FOUND) throw new PivError("no_cert", "There is no certificate in that slot");
  if (sw !== SW.OK) throw new PivError("card", `Could not read the certificate (SW=0x${sw.toString(16)})`);

  const outer = parseTlvs(data).find((x) => x.tag === TAG.OBJ_DATA);
  const inner = outer ? parseTlvs(outer.value) : [];
  const certTlv = inner.find((x) => x.tag === TAG.CERTIFICATE);
  const infoTlv = inner.find((x) => x.tag === TAG.CERT_INFO);
  if (!certTlv) throw new PivError("no_cert", "There is no certificate in that slot");

  let der = certTlv.value;
  if (infoTlv && infoTlv.value.length > 0 && infoTlv.value[0] === 1) der = gunzipSync(der);

  return new X509Certificate(der).toString(); // PEM
}

/** How many PIN retries are left. Does not consume one (uses metadata when available). */
export async function pinRetries(t: Transmitter): Promise<{ left: number | null; total: number | null }> {
  // PIN GET METADATA (YubiKey 5.3+): tag 0x06 = [default, remaining].
  const { data, sw } = await send(t, apdu(INS.GET_METADATA, 0x00, PIN_P2));
  if (sw === SW.OK) {
    const retries = parseTlvs(data).find((x) => x.tag === TAG.METADATA_RETRIES);
    if (retries && retries.value.length >= 2) {
      return { total: retries.value[0], left: retries.value[1] };
    }
  }
  return { left: null, total: null };
}

/** Verifies the PIN. Throws PivError with the number of retries left when it is wrong. */
export async function verifyPin(t: Transmitter, pin: string): Promise<void> {
  const bytes = Buffer.from(pin, "utf8");
  if (bytes.length > PIN_LEN) throw new PivError("pin_invalid", "The PIN cannot be longer than 8 characters");
  const padded = Buffer.concat([bytes, Buffer.alloc(PIN_LEN - bytes.length, 0xff)]);

  const { sw } = await send(t, apdu(INS.VERIFY, 0x00, PIN_P2, padded));
  if (sw === SW.OK) return;

  const left = retriesFromSw(sw);
  if (left === 0) throw new PivError("pin_blocked", "PIV PIN blocked. The PUK is required to unblock it.", 0);
  if (left !== null) {
    throw new PivError("pin_invalid", `Wrong PIV PIN. ${left} attempts left.`, left);
  }
  throw new PivError("card", `Could not verify the PIN (SW=0x${sw.toString(16)})`);
}

/** Reads everything the keys screen shows from PIV: slots with certificates and the PIN state. */
export async function readInfo(t: Transmitter): Promise<PivInfo> {
  await select(t);

  const slots: SlotInfo[] = [];
  for (const s of SLOTS) {
    const cert = await getCertificate(t, s.objectId);
    slots.push({
      slot: s.slot,
      slotName: s.name,
      label: s.label,
      hasCert: cert !== null,
      cert: cert ?? undefined,
    });
  }

  const { left, total } = await pinRetries(t);
  return { slots, pinRetries: left, pinTotal: total };
}
