import { closeSync, openSync, readFileSync, readSync, readdirSync, writeSync } from "node:fs";
import { randomBytes } from "node:crypto";

/**
 * Transporte CTAPHID sobre /dev/hidraw, para falar FIDO2 com a YubiKey.
 *
 * O FIDO2 não passa pelo CCID: usa a interface HID, com pacotes de tamanho fixo. Isto elimina
 * a última dependência de Python. Descoberta pelo report descriptor (Usage Page 0xF1D0).
 *
 * Ao contrário do OATH, aqui dá para cancelar de verdade: o CTAPHID tem CANCEL e KEEPALIVE.
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

/** Erro do próprio CTAP (o byte de status de um comando CBOR). */
export class CtapError extends Error {
  constructor(readonly status: number) {
    super(`CTAP status 0x${status.toString(16)}`);
    this.name = "CtapError";
  }
}

/** Acha o /dev/hidrawN da interface FIDO da YubiKey pelo report descriptor. */
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
      // Usage Page 0xF1D0 = FIDO. O descriptor começa com 06 D0 F1.
      if (desc[0] === 0x06 && desc[1] === 0xd0 && desc[2] === 0xf1) {
        const uevent = readFileSync(`/sys/class/hidraw/${name}/device/uevent`, "utf8");
        // Prioriza a Yubico se houver mais de um autenticador FIDO.
        if (/yubi/i.test(uevent)) return `/dev/${name}`;
      }
    } catch {
      // segue
    }
  }

  // Nenhuma Yubico: pega o primeiro FIDO qualquer.
  for (const name of entries) {
    try {
      const desc = readFileSync(`/sys/class/hidraw/${name}/device/report_descriptor`);
      if (desc[0] === 0x06 && desc[1] === 0xd0 && desc[2] === 0xf1) return `/dev/${name}`;
    } catch {
      // segue
    }
  }
  return null;
}

export class HidDevice {
  private fd = -1;
  private channelId = BROADCAST_CID;

  /** Abre o device e negocia um canal (CTAPHID_INIT). */
  async open(): Promise<void> {
    const path = findFidoDevice();
    if (!path) throw new HidError("no_device", "No FIDO authenticator found");

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
   * Envia um comando CTAPHID e junta a resposta (init packet + continuations).
   *
   * KEEPALIVE (a chave pedindo para esperar, ex.: aguardando toque) é consumido em silêncio.
   * ERROR vira exceção.
   */
  private call(cmd: number, data: Buffer): Buffer {
    // --- envio ---
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

    // --- recepção ---
    let response = Buffer.alloc(0);
    let expected = 0;
    let rseq = 0;
    let started = false;

    for (;;) {
      const pkt = this.readPacket();
      const channel = pkt.readUInt32BE(0);
      if (channel !== this.channelId) continue; // pacote de outro canal

      if (!started) {
        const rcmd = pkt[4];
        if (rcmd === (TYPE_INIT | CTAPHID.KEEPALIVE)) continue; // esperando (ex.: toque)
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
   * Envia um comando CBOR (CTAP2) e devolve os dados da resposta (sem o byte de status).
   * O primeiro byte da resposta é o status: 0x00 = ok, senão CtapError.
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
    // No Linux o report id (0x00) vai na frente: o write tem 65 bytes.
    const framed = Buffer.concat([Buffer.from([0x00]), pkt]);
    let written = 0;
    while (written < framed.length) {
      written += writeSync(this.fd, framed, written, framed.length - written);
    }
  }

  private readPacket(): Buffer {
    const buf = Buffer.alloc(PACKET_SIZE);
    let read = 0;
    // Uma leitura costuma trazer o pacote inteiro; o laço cobre leituras curtas.
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
        // ignora
      }
      this.fd = -1;
    }
  }
}

export { CTAPHID };
