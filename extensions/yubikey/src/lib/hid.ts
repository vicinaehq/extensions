import { closeSync, openSync, readFileSync, readSync, readdirSync, writeSync } from "node:fs";
import { randomBytes } from "node:crypto";

/**
 * CTAPHID transport over /dev/hidraw, to speak FIDO2 with the YubiKey.
 *
 * FIDO2 does not go through CCID: it uses the HID interface, with fixed-size packets. This
 * removes the last Python dependency. Discovery is by report descriptor (Usage Page 0xF1D0).
 *
 * Unlike OATH, here we can really cancel: CTAPHID has CANCEL and KEEPALIVE.
 */

const PACKET_SIZE = 64;

const CTAPHID = {
  INIT: 0x06,
  CBOR: 0x10,
  CANCEL: 0x11,
  KEEPALIVE: 0x3b,
  ERROR: 0x3f,
} as const;

const TYPE_INIT = 0x80;
const BROADCAST_CID = 0xffffffff;

export class HidError extends Error {
  constructor(
    readonly code: "no_device" | "no_access" | "protocol" | "io",
    message: string,
  ) {
    super(message);
    this.name = "HidError";
  }
}

/** A CTAP error proper (the status byte of a CBOR command). */
export class CtapError extends Error {
  constructor(readonly status: number) {
    super(`CTAP status 0x${status.toString(16)}`);
    this.name = "CtapError";
  }
}

/**
 * Yubico's USB vendor id, as sysfs writes it in the uevent: `HID_ID=bus:VVVVVVVV:PPPPPPPP`,
 * zero-padded. The vendor id is the stable identifier; the device name is not.
 */
const YUBICO_UEVENT = /^HID_ID=[^:]*:0*1050:/im;

/**
 * Finds the /dev/hidrawN of the YubiKey's FIDO interface, by report descriptor.
 *
 * Only a verified Yubico interface is ever returned. Falling back to any FIDO authenticator
 * would let this extension enumerate — and permanently delete — credentials on someone else's
 * security key while presenting it as the user's YubiKey.
 */
export function findFidoDevice(): string | null {
  let entries: string[];
  try {
    entries = readdirSync("/sys/class/hidraw");
  } catch {
    return null;
  }

  for (const name of entries) {
    try {
      const desc = readFileSync(`/sys/class/hidraw/${name}/device/report_descriptor`);
      // Usage Page 0xF1D0 = FIDO. The descriptor starts with 06 D0 F1.
      if (desc[0] !== 0x06 || desc[1] !== 0xd0 || desc[2] !== 0xf1) continue;

      const uevent = readFileSync(`/sys/class/hidraw/${name}/device/uevent`, "utf8");
      if (YUBICO_UEVENT.test(uevent)) return `/dev/${name}`;
    } catch {
      // keep looking
    }
  }

  // No verified Yubico FIDO interface was found.
  return null;
}

export class HidDevice {
  private fd = -1;
  private channelId = BROADCAST_CID;

  /** Opens the device and negotiates a channel (CTAPHID_INIT). */
  async open(): Promise<void> {
    const path = findFidoDevice();
    if (!path) throw new HidError("no_device", "No YubiKey FIDO interface found");

    try {
      this.fd = openSync(path, "r+");
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "EACCES") {
        throw new HidError(
          "no_access",
          "No permission to access the YubiKey over HID. Install the FIDO udev rules " +
            "(package `libfido2` on Fedora/Arch, `libu2f-udev` on Debian/Ubuntu).",
        );
      }
      throw new HidError("io", `Could not open the FIDO device: ${e.message}`);
    }

    const nonce = randomBytes(8);
    const resp = this.call(CTAPHID.INIT, nonce);
    if (!resp.subarray(0, 8).equals(nonce)) {
      throw new HidError("protocol", "The YubiKey answered INIT with a wrong nonce");
    }
    this.channelId = resp.readUInt32BE(8);
  }

  /**
   * Sends a CTAPHID command and reassembles the answer (init packet + continuations).
   *
   * KEEPALIVE (the key asking us to wait, e.g. while waiting for a touch) is consumed
   * silently. ERROR becomes an exception.
   */
  private call(cmd: number, data: Buffer): Buffer {
    // --- send ---
    let seq = 0;
    let offset = 0;

    // init packet: CID(4) + (0x80|cmd)(1) + bcnt(2) + payload
    const first = Buffer.alloc(PACKET_SIZE);
    first.writeUInt32BE(this.channelId, 0);
    first[4] = TYPE_INIT | cmd;
    first.writeUInt16BE(data.length, 5);
    const firstChunk = Math.min(data.length, PACKET_SIZE - 7);
    data.copy(first, 7, 0, firstChunk);
    this.writePacket(first);
    offset = firstChunk;

    // continuation packets: CID(4) + seq(1) + payload
    while (offset < data.length) {
      const pkt = Buffer.alloc(PACKET_SIZE);
      pkt.writeUInt32BE(this.channelId, 0);
      pkt[4] = seq & 0x7f;
      const chunk = Math.min(data.length - offset, PACKET_SIZE - 5);
      data.copy(pkt, 5, offset, offset + chunk);
      this.writePacket(pkt);
      offset += chunk;
      seq++;
    }

    // --- receive ---
    let response = Buffer.alloc(0);
    let expected = 0;
    let rseq = 0;
    let started = false;

    for (;;) {
      const pkt = this.readPacket();
      const channel = pkt.readUInt32BE(0);
      if (channel !== this.channelId) continue; // packet from another channel

      if (!started) {
        const rcmd = pkt[4];
        if (rcmd === (TYPE_INIT | CTAPHID.KEEPALIVE)) continue; // waiting (e.g. for a touch)
        if (rcmd === (TYPE_INIT | CTAPHID.ERROR)) throw new HidError("protocol", `CTAPHID error 0x${pkt[7].toString(16)}`);
        if (rcmd !== (TYPE_INIT | cmd)) throw new HidError("protocol", `Unexpected command 0x${rcmd.toString(16)}`);

        expected = pkt.readUInt16BE(5);
        const chunk = pkt.subarray(7, 7 + Math.min(expected, PACKET_SIZE - 7));
        response = Buffer.from(chunk);
        started = true;
        if (response.length >= expected) break;
      } else {
        if (pkt[4] !== (rseq & 0x7f)) throw new HidError("protocol", "CTAPHID sequence out of order");
        rseq++;
        const need = expected - response.length;
        const chunk = pkt.subarray(5, 5 + Math.min(need, PACKET_SIZE - 5));
        response = Buffer.concat([response, chunk]);
        if (response.length >= expected) break;
      }
    }

    return response.subarray(0, expected);
  }

  /**
   * Sends a CBOR (CTAP2) command and returns the response data (without the status byte).
   * The first byte of the response is the status: 0x00 = ok, anything else is a CtapError.
   */
  sendCbor(command: number, payload: Buffer): Buffer {
    const req = Buffer.concat([Buffer.from([command]), payload]);
    const resp = this.call(CTAPHID.CBOR, req);
    if (resp.length === 0) throw new HidError("protocol", "Empty CBOR response");
    const status = resp[0];
    if (status !== 0x00) throw new CtapError(status);
    return resp.subarray(1);
  }

  private writePacket(pkt: Buffer) {
    // On Linux the report id (0x00) goes first: the write is 65 bytes.
    const framed = Buffer.concat([Buffer.from([0x00]), pkt]);
    let written = 0;
    while (written < framed.length) {
      written += writeSync(this.fd, framed, written, framed.length - written);
    }
  }

  private readPacket(): Buffer {
    const buf = Buffer.alloc(PACKET_SIZE);
    let read = 0;
    // One read usually brings the whole packet; the loop covers short reads.
    while (read < PACKET_SIZE) {
      const n = readSync(this.fd, buf, read, PACKET_SIZE - read, null);
      if (n <= 0) throw new HidError("io", "Read from the FIDO device returned empty");
      read += n;
    }
    return buf;
  }

  close() {
    if (this.fd >= 0) {
      try {
        closeSync(this.fd);
      } catch {
        // ignore
      }
      this.fd = -1;
    }
  }
}

export { CTAPHID };
