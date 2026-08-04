import { existsSync } from "node:fs";
import net from "node:net";
import { readSerial } from "./mgmt";

/**
 * Native PC/SC client: speaks the `winscard_msg` protocol straight to pcscd, over a unix socket.
 *
 * It exists so nothing else has to be installed. The alternatives were `libpcsclite` through a
 * native addon (`vici build` produces a single esbuild bundle, so a `.node` would need
 * per-architecture prebuilds) or ykman's Python CLI (58 MB of RSS and ~1s to boot). This is just
 * `node:net`.
 *
 * The protocol is simple, but it has three traps that are expensive to ignore, all handled
 * below: the version negotiation, the asymmetric framing, and the fact that the reader's state
 * field on the wire does not use the API's public constants.
 */

// ---------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------

const CMD = {
  ESTABLISH_CONTEXT: 0x01,
  RELEASE_CONTEXT: 0x02,
  CONNECT: 0x04,
  DISCONNECT: 0x06,
  BEGIN_TRANSACTION: 0x07,
  END_TRANSACTION: 0x08,
  TRANSMIT: 0x09,
  VERSION: 0x11,
  GET_READERS_STATE: 0x12,
} as const;

/**
 * We send 4.4, not the newest version.
 *
 * The server accepts any minor in the range [PROTOCOL_VERSION_MINOR_SERVER_BACKWARD, its own],
 * which today is [4, 5] on pcsc-lite 2.x. Asking for a minor HIGHER than its own is rejected
 * with SCARD_E_SERVICE_STOPPED. Since 4.4 has been the accepted floor since 2021, it passes on
 * every current daemon. If it still fails, the answer carries the server's version and we retry
 * with that one.
 */
const PROTO_MAJOR = 4;
const PROTO_MINOR = 4;

const MAX_READERNAME = 128;
const READER_STATE_SIZE = 184;
const READER_STATE_COUNT = 16;

/** Response buffer of a short APDU: 256 bytes of data + 2 of status. */
const MAX_BUFFER_SIZE = 264;

export const SHARE = { EXCLUSIVE: 1, SHARED: 2, DIRECT: 3 } as const;
export const PROTOCOL = { T0: 1, T1: 2, ANY: 3 } as const;
export const DISPOSITION = { LEAVE: 0, RESET: 1, UNPOWER: 2, EJECT: 3 } as const;

/** The reader state AS IT COMES ON THE WIRE. Not to be confused with the API's SCARD_STATE_*
 *  constants: there, 0x20 is "card present"; here, 0x20 is "negotiable". Card present is 0x04. */
const WIRE_PRESENT = 0x04;

const RV = {
  OK: 0x00000000,
  E_NO_SERVICE: 0x8010001d,
  E_SERVICE_STOPPED: 0x8010001e,
  E_NO_READERS_AVAILABLE: 0x8010002e,
  E_NO_SMARTCARD: 0x8010000c,
  E_SHARING_VIOLATION: 0x8010000b,
  W_REMOVED_CARD: 0x80100069,
  W_RESET_CARD: 0x80100068,
  W_SECURITY_VIOLATION: 0x8010006a,
  E_READER_UNAVAILABLE: 0x80100017,
} as const;

export type PcscErrCode =
  | "no_daemon"
  | "not_authorized"
  | "no_reader"
  | "no_card"
  | "no_such_serial"
  | "bad_serial"
  | "busy"
  | "card_removed"
  | "protocol"
  | "io";

export class PcscError extends Error {
  constructor(
    readonly code: PcscErrCode,
    message: string,
    readonly rv?: number,
  ) {
    super(message);
    this.name = "PcscError";
  }
}

/** Turns a PC/SC rv into something the user can act on. */
function fromRv(rv: number, context: string): PcscError {
  switch (rv) {
    case RV.E_SHARING_VIOLATION:
      return new PcscError(
        "busy",
        "The YubiKey is reserved by another program (usually gpg-agent). Add `pcsc-shared` to " +
          "~/.gnupg/scdaemon.conf so it stops holding it exclusively.",
        rv,
      );
    case RV.E_NO_SMARTCARD:
      return new PcscError("no_card", "No YubiKey in the reader", rv);
    case RV.E_NO_READERS_AVAILABLE:
      return new PcscError(
        "no_reader",
        "No smart-card reader. The CCID driver is missing (package `ccid`).",
        rv,
      );
    case RV.W_REMOVED_CARD:
    case RV.W_RESET_CARD:
    case RV.E_READER_UNAVAILABLE:
      return new PcscError("card_removed", "The YubiKey was removed", rv);
    case RV.W_SECURITY_VIOLATION:
      return new PcscError(
        "not_authorized",
        "polkit denied access to the card. This usually happens outside an active graphical session.",
        rv,
      );
    case RV.E_SERVICE_STOPPED:
    case RV.E_NO_SERVICE:
      return new PcscError("no_daemon", "The pcscd service is unavailable", rv);
    default:
      return new PcscError("io", `${context} failed (rv=0x${rv.toString(16)})`, rv);
  }
}

function socketPath(override?: string): string {
  const candidates = [
    override,
    process.env.PCSCLITE_CSOCK_NAME,
    "/run/pcscd/pcscd.comm",
    "/var/run/pcscd/pcscd.comm",
  ].filter(Boolean) as string[];

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  throw new PcscError(
    "no_daemon",
    "pcscd is not running. Install `pcsc-lite` (or `pcscd` on Debian/Ubuntu) and enable it with: " +
      "sudo systemctl enable --now pcscd.socket",
  );
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/**
 * A connection to pcscd.
 *
 * The protocol has no correlation tag: an answer does not say which request it belongs to. So
 * there can only be **one command in flight per socket**, and calls are serialized in a queue.
 * Anything that needs concurrency (the touch, which locks the card for up to 15s) opens another
 * socket.
 */
export class PcscConnection {
  private sock: net.Socket | null = null;
  private buf = Buffer.alloc(0);
  private waiter: { need: number; resolve: (b: Buffer) => void } | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private hContext = 0;
  private hCard = 0;
  private protocol = 0;
  private closedReason: PcscError | null = null;

  constructor(private readonly override?: string) {}

  // ----- transporte -----

  private onData(chunk: Buffer) {
    this.buf = Buffer.concat([this.buf, chunk]);
    this.pump();
  }

  private pump() {
    if (!this.waiter || this.buf.length < this.waiter.need) return;
    const { need, resolve } = this.waiter;
    this.waiter = null;
    const out = this.buf.subarray(0, need);
    this.buf = this.buf.subarray(need);
    resolve(out);
  }

  /** The socket delivers arbitrary chunks; every read has to join them up to the exact size. */
  private readExactly(need: number): Promise<Buffer> {
    if (this.closedReason) return Promise.reject(this.closedReason);
    return new Promise<Buffer>((resolve, reject) => {
      this.waiter = { need, resolve };
      this.pump();
      // If the socket dies midway, `die()` rejects through here.
      this.rejectPending = reject;
    });
  }

  private rejectPending: ((e: Error) => void) | null = null;

  private die(err: PcscError) {
    this.closedReason = err;
    this.waiter = null;
    this.rejectPending?.(err);
    this.rejectPending = null;
    this.sock?.destroy();
    this.sock = null;
  }

  private async open() {
    const path = socketPath(this.override);
    const sock = net.createConnection(path);
    sock.setNoDelay(true);

    await new Promise<void>((resolve, reject) => {
      sock.once("connect", resolve);
      sock.once("error", (e: NodeJS.ErrnoException) => {
        reject(
          e.code === "ECONNREFUSED"
            ? new PcscError("no_daemon", "The pcscd socket exists but the service is not responding")
            : new PcscError("io", `Could not talk to pcscd: ${e.message}`),
        );
      });
    });

    sock.on("data", (c) => this.onData(c));

    // An end-of-connection with no answer right after connect is polkit's refusal signature:
    // pcscd closes the fd without writing anything when the session is not active (SSH, TTY,
    // container).
    sock.on("end", () => {
      this.die(
        new PcscError(
          "not_authorized",
          "pcscd refused the connection. polkit only grants card access to an active graphical " +
            "session, so this happens over SSH or on a TTY.",
        ),
      );
    });
    sock.on("error", (e) => this.die(new PcscError("io", e.message)));
    sock.on("close", () => {
      if (!this.closedReason) this.die(new PcscError("io", "pcscd closed the connection"));
    });

    this.sock = sock;
  }

  /** Sends header + payload. The server answers WITHOUT a header: only the struct (plus the data on transmit). */
  private send(command: number, payload: Buffer, extra?: Buffer) {
    if (!this.sock) throw this.closedReason ?? new PcscError("io", "The socket is closed");
    const header = Buffer.alloc(8);
    header.writeUInt32LE(payload.length, 0);
    header.writeUInt32LE(command, 4);
    const parts = extra ? [header, payload, extra] : [header, payload];
    this.sock.write(Buffer.concat(parts));
  }

  private async call(command: number, payload: Buffer, extra?: Buffer): Promise<Buffer> {
    this.send(command, payload, extra);
    return this.readExactly(payload.length);
  }

  /** Serializa: um comando em voo por socket, sempre. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => {});
    return next;
  }

  // ----- handshake -----

  private async handshake() {
    const req = Buffer.alloc(12);
    req.writeInt32LE(PROTO_MAJOR, 0);
    req.writeInt32LE(PROTO_MINOR, 4);
    const res = await this.call(CMD.VERSION, req);

    if (res.readUInt32LE(8) === RV.OK) return;

    // The server rejected our version but told us its own. Try again with that one.
    const theirMinor = res.readInt32LE(4);
    await this.reopen();

    const retry = Buffer.alloc(12);
    retry.writeInt32LE(PROTO_MAJOR, 0);
    retry.writeInt32LE(theirMinor, 4);
    const res2 = await this.call(CMD.VERSION, retry);

    if (res2.readUInt32LE(8) !== RV.OK) {
      throw new PcscError(
        "protocol",
        `pcscd speaks an incompatible protocol version (${res2.readInt32LE(0)}.${theirMinor})`,
      );
    }
  }

  private async reopen() {
    this.sock?.destroy();
    this.sock = null;
    this.buf = Buffer.alloc(0);
    this.closedReason = null;
    await this.open();
  }

  // ----- API -----

  /**
   * Opens a session on one YubiKey.
   *
   * With `serial` set, the key is resolved strictly: every reader holding a card is asked for
   * its serial number, and the connection only stands on the one that answers with a match.
   * Nothing is picked by proximity or by name, because silently landing on a different key is
   * how an operation ends up reading — or deleting — from the wrong one.
   */
  async connect(serial?: string): Promise<void> {
    // Every failure below happens with a live socket, and often a live pcscd context, already
    // in hand. The screens retry on their own, so leaking one of each per attempt would pile
    // up daemon-side handles for as long as the user keeps trying.
    try {
      await this.establish(serial);
    } catch (err) {
      await this.close().catch(() => {});
      throw err;
    }
  }

  private async establish(serial?: string): Promise<void> {
    await this.open();
    await this.handshake();

    const est = Buffer.alloc(12);
    est.writeUInt32LE(0, 0); // SCARD_SCOPE_USER
    const estRes = await this.call(CMD.ESTABLISH_CONTEXT, est);
    if (estRes.readUInt32LE(8) !== RV.OK) throw fromRv(estRes.readUInt32LE(8), "ESTABLISH_CONTEXT");
    this.hContext = estRes.readUInt32LE(4);

    const withCard = await this.readersWithCard();

    if (!serial) {
      // No pinning asked for: the YubiKey by name, otherwise the first card. A YubiKey sitting
      // in an external NFC reader has no "Yubico" in the reader name.
      const yubi = withCard.find((r) => /yubi/i.test(r.name));
      await this.attach((yubi ?? withCard[0]).name);
      return;
    }

    const wanted = Number(serial);
    if (!Number.isInteger(wanted) || wanted <= 0) {
      throw new PcscError(
        "bad_serial",
        `"${serial}" is not a YubiKey serial number. It is the decimal number printed by ` +
          "`ykman list`, digits only.",
      );
    }

    let lastFailure: PcscError | null = null;
    for (const reader of withCard) {
      try {
        await this.attach(reader.name);
      } catch (err) {
        // A card held exclusively by someone else says nothing about who it is. Keep looking:
        // the pinned key may well be in the next reader.
        lastFailure = err instanceof PcscError ? err : lastFailure;
        continue;
      }
      // A key with no management applet (firmware 4 and older) cannot tell us who it is, so it
      // can never be confirmed as the pinned one.
      const found = await this.transaction((t) => readSerial(t)).catch(() => null);
      if (found === wanted) return;
      await this.detach();
    }

    // Every candidate was unreachable rather than merely unmatched: report why, since "not
    // connected" would send the user looking for the wrong problem.
    if (lastFailure && lastFailure.code === "busy") throw lastFailure;

    throw new PcscError(
      "no_such_serial",
      `No YubiKey with serial ${wanted} is connected. Plug it in, or clear the "YubiKey serial" ` +
        "preference to use whichever key is present.",
    );
  }

  /** SCARD_CONNECT on one reader by name. */
  private async attach(reader: string): Promise<void> {
    // SHARE_SHARED: we do not take the card for ourselves. gpg and the browser keep working;
    // the exclusivity we need is only inside each transaction, which lasts milliseconds.
    const con = Buffer.alloc(4 + MAX_READERNAME + 4 * 5);
    con.writeUInt32LE(this.hContext, 0);
    con.write(reader, 4, "utf8");
    con.writeUInt32LE(SHARE.SHARED, 4 + MAX_READERNAME);
    con.writeUInt32LE(PROTOCOL.ANY, 4 + MAX_READERNAME + 4);

    const conRes = await this.call(CMD.CONNECT, con);
    const rv = conRes.readUInt32LE(4 + MAX_READERNAME + 16);
    if (rv !== RV.OK) throw fromRv(rv, "SCARD_CONNECT");

    this.hCard = conRes.readInt32LE(4 + MAX_READERNAME + 8);
    this.protocol = conRes.readUInt32LE(4 + MAX_READERNAME + 12);
  }

  /** Lets go of the current card, keeping the context for the next candidate. */
  private async detach(): Promise<void> {
    if (!this.hCard) return;
    const req = Buffer.alloc(12);
    req.writeInt32LE(this.hCard, 0);
    req.writeUInt32LE(DISPOSITION.LEAVE, 4);
    await this.call(CMD.DISCONNECT, req).catch(() => {});
    this.hCard = 0;
    this.protocol = 0;
  }

  /**
   * Lists the readers that currently hold a card.
   *
   * `GET_READERS_STATE` is the right path: the enum's `SCARD_LIST_READERS` has no handler in the
   * daemon (libpcsclite answers it from a local cache). And it waits for the readers to
   * initialize, which kills the race with systemd's socket activation for free.
   */
  private async readersWithCard(): Promise<{ name: string; hasCard: boolean }[]> {
    // This command does not follow the rule of the others: the request has no payload, and the
    // answer is always a fixed block of 16 slots, in every version of the protocol. It is the
    // most stable thing here.
    this.send(CMD.GET_READERS_STATE, Buffer.alloc(0));
    const blob = await this.readExactly(READER_STATE_SIZE * READER_STATE_COUNT);

    const readers: { name: string; hasCard: boolean }[] = [];
    for (let i = 0; i < READER_STATE_COUNT; i++) {
      const off = i * READER_STATE_SIZE;
      if (off + READER_STATE_SIZE > blob.length) break;
      const name = blob.subarray(off, off + MAX_READERNAME).toString("utf8").replace(/\0.*$/, "");
      if (!name) continue;
      const state = blob.readUInt32LE(off + 128 + 4);
      readers.push({ name, hasCard: (state & WIRE_PRESENT) !== 0 });
    }

    if (readers.length === 0) {
      throw new PcscError(
        "no_reader",
        "No smart-card reader found. If the YubiKey is plugged in, the CCID driver may be missing " +
          "(package `ccid`), or CCID may be disabled on the key.",
      );
    }

    const withCard = readers.filter((r) => r.hasCard);
    if (withCard.length === 0) {
      throw new PcscError("no_card", "Connect the YubiKey");
    }
    return withCard;
  }

  /**
   * Runs a sequence of APDUs inside a transaction.
   *
   * The transaction is not about performance or selfishness: without it, gpg-agent can SELECT
   * the OpenPGP applet in the middle of our sequence (SELECT OATH → VALIDATE → CALCULATE_ALL)
   * and deselect OATH from under us. The result would be an unexplained error or, worse, data
   * from the wrong applet.
   *
   * The transaction lasts a few milliseconds. Whoever bumps into it gets SHARING_VIOLATION, and
   * the other program's libpcsclite already retries on its own.
   */
  async transaction<T>(fn: (t: Transmitter) => Promise<T>): Promise<T> {
    return this.run(async () => {
      await this.begin();
      try {
        return await fn((apdu) => this.transmit(apdu));
      } finally {
        await this.end().catch(() => {});
      }
    });
  }

  private async begin(): Promise<void> {
    // The daemon returns SHARING_VIOLATION right away (after sleeping 100ms), it does not
    // block. The client is the one that insists. libpcsclite does that in an infinite loop; we
    // put a ceiling on it, otherwise a stuck gpg would hang the extension forever.
    const DEADLINE = Date.now() + 3000;
    for (;;) {
      const req = Buffer.alloc(8);
      req.writeInt32LE(this.hCard, 0);
      const res = await this.call(CMD.BEGIN_TRANSACTION, req);
      const rv = res.readUInt32LE(4);
      if (rv === RV.OK) return;
      if (rv !== RV.E_SHARING_VIOLATION) throw fromRv(rv, "BEGIN_TRANSACTION");
      if (Date.now() > DEADLINE) throw fromRv(RV.E_SHARING_VIOLATION, "BEGIN_TRANSACTION");
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  private async end(): Promise<void> {
    const req = Buffer.alloc(12);
    req.writeInt32LE(this.hCard, 0);
    req.writeUInt32LE(DISPOSITION.LEAVE, 4);
    await this.call(CMD.END_TRANSACTION, req);
  }

  private async transmit(apdu: Buffer): Promise<Buffer> {
    const req = Buffer.alloc(32);
    req.writeInt32LE(this.hCard, 0);
    req.writeUInt32LE(this.protocol, 4); // ioSendPciProtocol
    req.writeUInt32LE(8, 8); // ioSendPciLength
    req.writeUInt32LE(apdu.length, 12); // cbSendLength
    req.writeUInt32LE(this.protocol, 16);
    req.writeUInt32LE(8, 20);
    req.writeUInt32LE(MAX_BUFFER_SIZE, 24); // pcbRecvLength: the capacity of our buffer

    const res = await this.call(CMD.TRANSMIT, req, apdu);
    const rv = res.readUInt32LE(28);
    if (rv !== RV.OK) throw fromRv(rv, "TRANSMIT");

    const len = res.readUInt32LE(24);
    return len > 0 ? this.readExactly(len) : Buffer.alloc(0);
  }

  /**
   * Drops the connection immediately, rejecting whatever is in flight.
   *
   * `close()` is the graceful path: it sends DISCONNECT and waits for the answer, which installs
   * a new read waiter. There is only one waiter slot, so doing that while a TRANSMIT is still
   * pending would overwrite the blocked operation's waiter and leave its promise unsettled
   * forever. Cancelling a touch is exactly that situation: the card holds the transaction for up
   * to 15s and the answer is never coming.
   */
  abort(reason = "The operation was cancelled"): void {
    if (!this.sock && this.closedReason) return;
    this.die(new PcscError("io", reason));
    this.hCard = 0;
    this.hContext = 0;
  }

  async close(): Promise<void> {
    if (!this.sock) return;
    try {
      if (this.hCard) {
        const req = Buffer.alloc(12);
        req.writeInt32LE(this.hCard, 0);
        req.writeUInt32LE(DISPOSITION.LEAVE, 4); // leave the card powered: be a good citizen
        await this.call(CMD.DISCONNECT, req);
      }
      if (this.hContext) {
        const req = Buffer.alloc(8);
        req.writeUInt32LE(this.hContext, 0);
        await this.call(CMD.RELEASE_CONTEXT, req);
      }
    } catch {
      // Closing anyway.
    }
    this.sock?.end();
    this.sock?.destroy();
    this.sock = null;
    this.hCard = 0;
    this.hContext = 0;
  }
}

/** Envia um APDU e devolve a resposta crua (dados + 2 bytes de status). */
export type Transmitter = (apdu: Buffer) => Promise<Buffer>;
