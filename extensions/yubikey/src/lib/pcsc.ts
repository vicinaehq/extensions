import { existsSync } from "node:fs";
import net from "node:net";

/**
 * Cliente PC/SC nativo: fala o protocolo `winscard_msg` direto com o pcscd, por socket unix.
 *
 * Existe para não depender de nada. A alternativa seria o `libpcsclite` via addon nativo (o
 * `vici build` gera um bundle único com esbuild, então um `.node` exigiria prebuilds por
 * arquitetura) ou o CLI do ykman em Python (58 MB de RSS e ~1s de boot). Aqui é só `node:net`.
 *
 * O protocolo é simples, mas tem três armadilhas que custam caro se ignoradas, todas tratadas
 * abaixo: a negociação de versão, o framing assimétrico, e o fato de que o campo de estado do
 * reader no fio não usa as constantes públicas da API.
 */

// ---------------------------------------------------------------------------
// Protocolo
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
 * Mandamos 4.4, e não a versão mais nova.
 *
 * O servidor aceita qualquer minor no intervalo [PROTOCOL_VERSION_MINOR_SERVER_BACKWARD,
 * o dele], que hoje é [4, 5] no pcsc-lite 2.x. Pedir um minor MAIOR que o dele é rejeitado com
 * SCARD_E_SERVICE_STOPPED. Como 4.4 é o piso aceito desde 2021, ele passa em todo daemon atual.
 * Se mesmo assim falhar, a resposta traz a versão do servidor e re-tentamos com ela.
 */
const PROTO_MAJOR = 4;
const PROTO_MINOR = 4;

const MAX_READERNAME = 128;
const READER_STATE_SIZE = 184;
const READER_STATE_COUNT = 16;

/** Buffer de resposta de um APDU curto: 256 bytes de dados + 2 de status. */
const MAX_BUFFER_SIZE = 264;

export const SHARE = { EXCLUSIVE: 1, SHARED: 2, DIRECT: 3 } as const;
export const PROTOCOL = { T0: 1, T1: 2, ANY: 3 } as const;
export const DISPOSITION = { LEAVE: 0, RESET: 1, UNPOWER: 2, EJECT: 3 } as const;

/** Estado do reader COMO VEM NO FIO. Não confundir com as constantes SCARD_STATE_* da API:
 *  lá, 0x20 é "cartão presente"; aqui, 0x20 é "negociável". Cartão presente é 0x04. */
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

/** Traduz um rv do PC/SC para algo que o usuário possa agir a respeito. */
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
// Conexão
// ---------------------------------------------------------------------------

/**
 * Uma conexão com o pcscd.
 *
 * O protocolo não tem tag de correlação: a resposta não diz a que pedido pertence. Logo, só
 * pode haver **um comando em voo por socket**, e as chamadas são serializadas numa fila.
 * Quem precisa de concorrência (o toque, que trava o cartão por até 15s) abre outro socket.
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

  /** O socket entrega pedaços arbitrários; todo read precisa juntar até ter o tamanho exato. */
  private readExactly(need: number): Promise<Buffer> {
    if (this.closedReason) return Promise.reject(this.closedReason);
    return new Promise<Buffer>((resolve, reject) => {
      this.waiter = { need, resolve };
      this.pump();
      // Se o socket morrer no meio, `die()` rejeita por aqui.
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

    // Fim de conexão sem resposta logo depois do connect é a assinatura do polkit recusando:
    // o pcscd fecha o fd sem escrever nada quando a sessão não é ativa (SSH, TTY, container).
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

  /** Envia header + payload. O servidor responde SEM header: só o struct (e, no transmit, os dados). */
  private send(command: number, payload: Buffer, extra?: Buffer) {
    if (!this.sock) throw this.closedReason ?? new PcscError("io", "socket fechado");
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

    // O servidor rejeitou nossa versão, mas nos disse a dele. Tenta de novo com ela.
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

  async connect(preferredSerialOrName?: string): Promise<void> {
    await this.open();
    await this.handshake();

    const est = Buffer.alloc(12);
    est.writeUInt32LE(0, 0); // SCARD_SCOPE_USER
    const estRes = await this.call(CMD.ESTABLISH_CONTEXT, est);
    if (estRes.readUInt32LE(8) !== RV.OK) throw fromRv(estRes.readUInt32LE(8), "ESTABLISH_CONTEXT");
    this.hContext = estRes.readUInt32LE(4);

    const reader = await this.pickReader(preferredSerialOrName);

    // SHARE_SHARED: não tomamos o cartão para nós. O gpg e o navegador seguem funcionando; a
    // exclusividade que precisamos é só dentro de cada transação, que dura milissegundos.
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

  /**
   * Lista os readers e escolhe um com cartão presente.
   *
   * `GET_READERS_STATE` é o caminho certo: o `SCARD_LIST_READERS` do enum não tem handler no
   * daemon (o libpcsclite responde do cache local). E ele espera os readers inicializarem, o
   * que mata de graça a corrida com a ativação por socket do systemd.
   */
  private async pickReader(preferred?: string): Promise<string> {
    // Este comando não segue a regra dos outros: o pedido não tem payload, e a resposta é sempre
    // um bloco fixo de 16 slots, em qualquer versão do protocolo. É o ponto mais estável daqui.
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

    // Preferência do usuário, se casar. Senão, a YubiKey pelo nome. Senão, o primeiro com cartão:
    // uma YubiKey num leitor NFC externo não tem "Yubico" no nome do reader.
    if (preferred) {
      const hit = withCard.find((r) => r.name.includes(preferred));
      if (hit) return hit.name;
    }
    const yubi = withCard.find((r) => /yubi/i.test(r.name));
    return (yubi ?? withCard[0]).name;
  }

  /**
   * Executa uma sequência de APDUs dentro de uma transação.
   *
   * A transação não é sobre performance nem sobre egoísmo: sem ela, o gpg-agent pode dar SELECT
   * no applet OpenPGP no meio da nossa sequência (SELECT OATH → VALIDATE → CALCULATE_ALL) e
   * deselecionar o OATH debaixo de nós. O resultado seria um erro sem explicação, ou pior, dados
   * do applet errado.
   *
   * A transação dura poucos milissegundos. Quem esbarrar nela leva SHARING_VIOLATION e o
   * libpcsclite do outro programa já refaz a tentativa sozinho.
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
    // O daemon devolve SHARING_VIOLATION na hora (já tendo dormido 100ms), não bloqueia. Quem
    // insiste é o cliente. O libpcsclite faz isso num laço infinito; nós pomos um teto, senão
    // um gpg travado penduraria a extensão para sempre.
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
    req.writeUInt32LE(MAX_BUFFER_SIZE, 24); // pcbRecvLength: capacidade do nosso buffer

    const res = await this.call(CMD.TRANSMIT, req, apdu);
    const rv = res.readUInt32LE(28);
    if (rv !== RV.OK) throw fromRv(rv, "TRANSMIT");

    const len = res.readUInt32LE(24);
    return len > 0 ? this.readExactly(len) : Buffer.alloc(0);
  }

  async close(): Promise<void> {
    if (!this.sock) return;
    try {
      if (this.hCard) {
        const req = Buffer.alloc(12);
        req.writeInt32LE(this.hCard, 0);
        req.writeUInt32LE(DISPOSITION.LEAVE, 4); // deixa o cartão ligado: bom cidadão
        await this.call(CMD.DISCONNECT, req);
      }
      if (this.hContext) {
        const req = Buffer.alloc(8);
        req.writeUInt32LE(this.hContext, 0);
        await this.call(CMD.RELEASE_CONTEXT, req);
      }
    } catch {
      // Fechando de qualquer forma.
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
