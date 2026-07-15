import net from "node:net";
import { userInfo } from "node:os";

/**
 * Cliente D-Bus mínimo, só o suficiente para o Secret Service.
 *
 * Não usamos uma lib pronta de propósito: as puras-JS trazem uma árvore de dependências
 * (event-stream, xml2js, ...) que não quero carregar para dentro de um plugin de segurança,
 * e as rápidas dependem de addon nativo, que o `vici build` (esbuild → bundle único) não
 * empacota. O subconjunto do protocolo que o Secret Service exige é pequeno.
 *
 * Implementa: handshake SASL EXTERNAL, marshalling little-endian dos tipos que usamos
 * (s, o, a{ss}, variantes), e method calls com correlação por serial.
 */

type Sig = string;

export type DbusValue = string | number | boolean | Buffer | DbusValue[] | { [k: string]: DbusValue } | Variant;
export class Variant {
  constructor(
    readonly sig: Sig,
    readonly value: DbusValue,
  ) {}
}

function pad(len: number, align: number): number {
  return (align - (len % align)) % align;
}

/** Alinhamento (em bytes) do primeiro elemento de um array cujo tipo começa em sig[i]. */
function elementAlignment(sig: string, i: number): number {
  switch (sig[i]) {
    case "y":
    case "g":
    case "v":
      return 1;
    case "u":
    case "s":
    case "o":
    case "a":
      return 4;
    case "(":
    case "{":
      return 8;
    default:
      return 1;
  }
}

// ---------------------------------------------------------------------------
// Marshalling
// ---------------------------------------------------------------------------

/**
 * Serializa para D-Bus (little-endian) sobre um buffer que cresce.
 *
 * Trabalha num único buffer contíguo, e não numa lista de pedaços, porque o alinhamento do
 * D-Bus é relativo ao início da MENSAGEM: um array reserva 4 bytes de comprimento e só depois
 * sabe o valor, então precisamos voltar e preenchê-lo no lugar. Com um buffer contíguo isso é
 * um `writeUInt32LE` na posição; com pedaços viraria uma dança de índices frágil.
 */
class Writer {
  private buf = Buffer.alloc(256);
  len = 0;

  private ensure(extra: number) {
    if (this.len + extra <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + extra) size *= 2;
    const bigger = Buffer.alloc(size);
    this.buf.copy(bigger, 0, 0, this.len);
    this.buf = bigger;
  }
  align(a: number) {
    const p = pad(this.len, a);
    this.ensure(p);
    this.len += p;
  }
  byte(v: number) {
    this.ensure(1);
    this.buf[this.len++] = v & 0xff;
  }
  private u32at(pos: number, v: number) {
    this.buf.writeUInt32LE(v >>> 0, pos);
  }
  uint32(v: number) {
    this.align(4);
    this.ensure(4);
    this.buf.writeUInt32LE(v >>> 0, this.len);
    this.len += 4;
  }
  private bytes(b: Buffer) {
    this.ensure(b.length);
    b.copy(this.buf, this.len);
    this.len += b.length;
  }
  string(v: string) {
    const s = Buffer.from(v, "utf8");
    this.uint32(s.length);
    this.bytes(s);
    this.byte(0);
  }
  signature(v: string) {
    const s = Buffer.from(v, "utf8");
    this.byte(s.length);
    this.bytes(s);
    this.byte(0);
  }

  /** Serializa um único valor completo da assinatura `sig`. */
  marshal(sig: Sig, value: DbusValue) {
    this.one(sig, 0, value);
  }

  /** Escreve o item que começa em sig[i]; devolve o índice logo após o tipo consumido. */
  private one(sig: Sig, i: number, v: DbusValue): number {
    switch (sig[i]) {
      case "y":
        this.byte(v as number);
        return i + 1;
      case "u":
        this.uint32(v as number);
        return i + 1;
      case "s":
      case "o":
        this.string(v as string);
        return i + 1;
      case "g":
        this.signature(v as string);
        return i + 1;
      case "v": {
        const variant = v as Variant;
        this.signature(variant.sig);
        this.one(variant.sig, 0, variant.value);
        return i + 1;
      }
      case "(": {
        this.align(8);
        let j = i + 1;
        const arr = v as DbusValue[];
        let k = 0;
        while (sig[j] !== ")") j = this.one(sig, j, arr[k++]);
        return j + 1;
      }
      case "a": {
        const elemStart = i + 1;
        this.align(4);
        const lenPos = this.len;
        this.ensure(4);
        this.len += 4; // reserva o comprimento

        // O comprimento do array conta a partir do PRIMEIRO elemento, já alinhado. O padding
        // entre o campo de comprimento e o primeiro elemento não entra na conta, então alinhamos
        // aqui, antes de marcar o início dos dados.
        const isDict = sig[elemStart] === "{";
        this.align(elementAlignment(sig, elemStart));
        const dataStart = this.len;

        if (isDict) {
          const inner = sig.slice(elemStart + 1, sig.indexOf("}", elemStart));
          for (const [key, val] of Object.entries(v as Record<string, DbusValue>)) {
            this.align(8);
            const afterKey = this.one(inner, 0, key);
            this.one(inner, afterKey, val);
          }
        } else {
          for (const item of v as DbusValue[]) this.one(sig, elemStart, item);
        }

        this.u32at(lenPos, this.len - dataStart);
        return this.skipType(sig, elemStart);
      }
      default:
        throw new Error(`marshal: unsupported signature '${sig[i]}'`);
    }
  }

  private skipType(sig: Sig, i: number): number {
    if (sig[i] === "a") return this.skipType(sig, i + 1);
    if (sig[i] === "{") return sig.indexOf("}", i) + 1;
    if (sig[i] === "(") {
      let depth = 1;
      let j = i + 1;
      while (depth > 0) {
        if (sig[j] === "(") depth++;
        if (sig[j] === ")") depth--;
        j++;
      }
      return j;
    }
    return i + 1;
  }

  buffer(): Buffer {
    return this.buf.subarray(0, this.len);
  }
}

class Reader {
  pos = 0;
  constructor(private buf: Buffer) {}

  private align(a: number) {
    this.pos += pad(this.pos, a);
  }
  byte(): number {
    return this.buf[this.pos++];
  }
  uint32(): number {
    this.align(4);
    const v = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  string(): string {
    const len = this.uint32();
    const s = this.buf.toString("utf8", this.pos, this.pos + len);
    this.pos += len + 1;
    return s;
  }
  signature(): string {
    const len = this.byte();
    const s = this.buf.toString("utf8", this.pos, this.pos + len);
    this.pos += len + 1;
    return s;
  }

  read(sig: Sig): DbusValue {
    switch (sig[0]) {
      case "y":
        return this.byte();
      case "u":
        return this.uint32();
      case "s":
      case "o":
        return this.string();
      case "g":
        return this.signature();
      case "v": {
        const vs = this.signature();
        return new Variant(vs, this.read(vs));
      }
      case "a": {
        const elem = sig.slice(1);
        const len = this.uint32();
        // O comprimento conta a partir do primeiro elemento já alinhado, então alinhamos ANTES
        // de calcular onde o array termina.
        this.align(elementAlignment(sig, 1));
        const end = this.pos + len;
        if (elem[0] === "{") {
          const out: Record<string, DbusValue> = {};
          const inner = elem.slice(1, elem.indexOf("}"));
          while (this.pos < end) {
            this.align(8);
            const k = this.read(inner[0]) as string;
            const v = this.read(inner.slice(1));
            out[k] = v;
          }
          return out;
        }
        if (elem === "y") {
          const b = this.buf.subarray(this.pos, end);
          this.pos = end;
          return Buffer.from(b);
        }
        const arr: DbusValue[] = [];
        while (this.pos < end) arr.push(this.read(elem));
        return arr;
      }
      case "(": {
        this.align(8);
        const out: DbusValue[] = [];
        let i = 1;
        while (sig[i] !== ")") {
          const sub = readOneSig(sig, i);
          out.push(this.read(sig.slice(i, i + sub)));
          i += sub;
        }
        return out;
      }
      default:
        throw new Error(`unmarshal: unsupported signature '${sig[0]}'`);
    }
  }
}

function readOneSig(sig: string, i: number): number {
  if (sig[i] === "a") return 1 + readOneSig(sig, i + 1);
  if (sig[i] === "(" || sig[i] === "{") {
    const close = sig[i] === "(" ? ")" : "}";
    const open = sig[i];
    let depth = 1;
    let j = i + 1;
    while (depth > 0) {
      if (sig[j] === open) depth++;
      if (sig[j] === close) depth--;
      j++;
    }
    return j - i;
  }
  return 1;
}

// ---------------------------------------------------------------------------
// Conexão D-Bus
// ---------------------------------------------------------------------------

const MESSAGE_TYPE = { METHOD_CALL: 1, METHOD_RETURN: 2, ERROR: 3, SIGNAL: 4 } as const;
const HEADER = { PATH: 1, INTERFACE: 2, MEMBER: 3, ERROR_NAME: 4, REPLY_SERIAL: 5, DESTINATION: 6, SIGNATURE: 8 } as const;

export type MethodCall = {
  destination: string;
  path: string;
  iface: string;
  member: string;
  signature?: string;
  args?: DbusValue[];
};

export class DbusError extends Error {}

export class DbusConnection {
  private sock!: net.Socket;
  private buf = Buffer.alloc(0);
  private serial = 1;
  private pending = new Map<number, { resolve: (v: DbusValue[]) => void; reject: (e: Error) => void }>();

  static sessionAddress(): string {
    const addr = process.env.DBUS_SESSION_BUS_ADDRESS;
    if (addr?.startsWith("unix:path=")) return addr.slice("unix:path=".length).split(",")[0];
    if (addr?.includes("abstract=")) return "\0" + addr.split("abstract=")[1].split(",")[0];
    return `/run/user/${process.getuid?.() ?? 1000}/bus`;
  }

  async connect(): Promise<void> {
    const path = DbusConnection.sessionAddress();
    this.sock = net.createConnection({ path });
    await new Promise<void>((resolve, reject) => {
      this.sock.once("connect", resolve);
      this.sock.once("error", reject);
    });
    await this.authenticate();
    this.sock.on("data", (c) => this.onData(c));
    // Hello: obrigatório antes de qualquer outra chamada.
    await this.call({
      destination: "org.freedesktop.DBus",
      path: "/org/freedesktop/DBus",
      iface: "org.freedesktop.DBus",
      member: "Hello",
    });
  }

  /** Handshake SASL EXTERNAL: autentica pelo uid do socket, sem senha. */
  private authenticate(): Promise<void> {
    const uid = (process.getuid?.() ?? userInfo().uid).toString();
    const uidHex = Buffer.from(uid, "utf8").toString("hex");
    return new Promise<void>((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        const line = chunk.toString("ascii");
        if (line.startsWith("OK")) {
          this.sock.write("BEGIN\r\n");
          this.sock.removeListener("data", onData);
          resolve();
        } else if (line.startsWith("REJECTED")) {
          this.sock.removeListener("data", onData);
          reject(new DbusError("D-Bus refused SASL authentication"));
        }
      };
      this.sock.on("data", onData);
      this.sock.write(`\0AUTH EXTERNAL ${uidHex}\r\n`);
    });
  }

  private onData(chunk: Buffer) {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      const msg = this.tryParse();
      if (!msg) break;
    }
  }

  private tryParse(): boolean {
    if (this.buf.length < 16) return false;
    const r = new Reader(this.buf);
    r.byte(); // endianness (assumimos 'l')
    const type = r.byte();
    r.byte(); // flags
    r.byte(); // versão
    const bodyLen = r.uint32();
    const serial = r.uint32();
    const fieldsLen = this.buf.readUInt32LE(r.pos);

    const headerEnd = r.pos + 4 + fieldsLen;
    const bodyStart = headerEnd + pad(headerEnd, 8);
    if (this.buf.length < bodyStart + bodyLen) return false;

    // Parse dos campos de cabeçalho para achar reply serial, assinatura e nome de erro.
    const fields = new Reader(this.buf);
    fields.pos = r.pos;
    const fieldArr = fields.read("a(yv)") as DbusValue[];
    let replySerial = 0;
    let bodySig = "";
    let errorName = "";
    for (const f of fieldArr as [number, Variant][]) {
      const code = f[0];
      const v = f[1] as Variant;
      if (code === HEADER.REPLY_SERIAL) replySerial = v.value as number;
      if (code === HEADER.SIGNATURE) bodySig = v.value as string;
      if (code === HEADER.ERROR_NAME) errorName = v.value as string;
    }

    const body = this.buf.subarray(bodyStart, bodyStart + bodyLen);
    this.buf = this.buf.subarray(bodyStart + bodyLen);

    const waiter = this.pending.get(replySerial);
    if (waiter) {
      this.pending.delete(replySerial);
      if (type === MESSAGE_TYPE.ERROR) {
        waiter.reject(new DbusError(errorName || "erro D-Bus"));
      } else {
        const values = bodySig ? (this.readBody(body, bodySig) as DbusValue[]) : [];
        waiter.resolve(values);
      }
    }
    void serial;
    return true;
  }

  private readBody(body: Buffer, sig: string): DbusValue[] {
    const r = new Reader(body);
    const out: DbusValue[] = [];
    let i = 0;
    while (i < sig.length) {
      const n = readOneSig(sig, i);
      out.push(r.read(sig.slice(i, i + n)));
      i += n;
    }
    return out;
  }

  call(msg: MethodCall): Promise<DbusValue[]> {
    const serial = this.serial++;

    const fields: [number, Variant][] = [
      [HEADER.PATH, new Variant("o", msg.path)],
      [HEADER.DESTINATION, new Variant("s", msg.destination)],
      [HEADER.INTERFACE, new Variant("s", msg.iface)],
      [HEADER.MEMBER, new Variant("s", msg.member)],
    ];
    if (msg.signature) fields.push([HEADER.SIGNATURE, new Variant("g", msg.signature)]);

    const bodyW = new Writer();
    if (msg.signature && msg.args) {
      let i = 0;
      for (const arg of msg.args) {
        const n = readOneSig(msg.signature, i);
        bodyW.marshal(msg.signature.slice(i, i + n), arg);
        i += n;
      }
    }
    const body = bodyW.buffer();

    const headW = new Writer();
    headW.byte(0x6c); // 'l' little-endian
    headW.byte(MESSAGE_TYPE.METHOD_CALL);
    headW.byte(0); // flags
    headW.byte(1); // versão
    headW.uint32(body.length);
    headW.uint32(serial);
    headW.marshal(
      "a(yv)",
      fields.map(([code, v]) => [code, v] as unknown as DbusValue),
    );
    const head = headW.buffer();
    const padding = Buffer.alloc(pad(head.length, 8));

    return new Promise<DbusValue[]>((resolve, reject) => {
      this.pending.set(serial, { resolve, reject });
      this.sock.write(Buffer.concat([head, padding, body]));
    });
  }

  close() {
    this.sock?.end();
    this.sock?.destroy();
  }
}
