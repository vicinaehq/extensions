/**
 * CBOR no dialeto que o CTAP2 usa (RFC 8949, forma canônica "CTAP2 canonical").
 *
 * Só o subconjunto que aparece no protocolo: inteiros, byte strings, text strings, arrays e
 * mapas. A regra canônica que importa: as chaves de um mapa saem ordenadas pelos bytes da
 * codificação (comprimento primeiro, depois lexicográfico), e todo comprimento usa a forma mais
 * curta possível. A YubiKey rejeita CBOR não-canônico.
 */

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

function encodeHead(major: number, value: number): Buffer {
  const mt = major << 5;
  if (value < 24) return Buffer.from([mt | value]);
  if (value < 0x100) return Buffer.from([mt | 24, value]);
  if (value < 0x10000) {
    const b = Buffer.alloc(3);
    b[0] = mt | 25;
    b.writeUInt16BE(value, 1);
    return b;
  }
  if (value < 0x100000000) {
    const b = Buffer.alloc(5);
    b[0] = mt | 26;
    b.writeUInt32BE(value, 1);
    return b;
  }
  const b = Buffer.alloc(9);
  b[0] = mt | 27;
  b.writeBigUInt64BE(BigInt(value), 1);
  return b;
}

export type CborValue =
  | number
  | boolean
  | Buffer
  | string
  | CborValue[]
  | Map<number | string, CborValue>
  | { [k: string]: CborValue };

export function encode(value: CborValue): Buffer {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new Error("CBOR: only integers are supported");
    return value >= 0 ? encodeHead(0, value) : encodeHead(1, -value - 1);
  }
  if (typeof value === "boolean") return Buffer.from([value ? 0xf5 : 0xf4]);
  if (Buffer.isBuffer(value)) return Buffer.concat([encodeHead(2, value.length), value]);
  if (typeof value === "string") {
    const utf8 = Buffer.from(value, "utf8");
    return Buffer.concat([encodeHead(3, utf8.length), utf8]);
  }
  if (Array.isArray(value)) {
    return Buffer.concat([encodeHead(4, value.length), ...value.map(encode)]);
  }
  if (value instanceof Map) {
    return encodeMap([...value.entries()]);
  }
  if (typeof value === "object") {
    return encodeMap(Object.entries(value));
  }
  throw new Error("CBOR: unsupported type");
}

function encodeMap(entries: [number | string, CborValue][]): Buffer {
  // Ordenação canônica: pelos bytes da chave codificada.
  const encoded = entries.map(([k, v]) => ({
    key: typeof k === "number" ? encode(k) : encode(String(k)),
    val: encode(v),
  }));
  encoded.sort((a, b) => {
    if (a.key.length !== b.key.length) return a.key.length - b.key.length;
    return a.key.compare(b.key);
  });
  return Buffer.concat([encodeHead(5, entries.length), ...encoded.flatMap((e) => [e.key, e.val])]);
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

type DecodedValue = number | boolean | null | Buffer | string | DecodedValue[] | Map<number | string, DecodedValue>;

class Decoder {
  pos = 0;
  constructor(private buf: Buffer) {}

  private readHead(): { major: number; value: number } {
    const first = this.buf[this.pos++];
    const major = first >> 5;
    const info = first & 0x1f;
    if (info < 24) return { major, value: info };
    if (info === 24) return { major, value: this.buf[this.pos++] };
    if (info === 25) {
      const v = this.buf.readUInt16BE(this.pos);
      this.pos += 2;
      return { major, value: v };
    }
    if (info === 26) {
      const v = this.buf.readUInt32BE(this.pos);
      this.pos += 4;
      return { major, value: v };
    }
    if (info === 27) {
      const v = Number(this.buf.readBigUInt64BE(this.pos));
      this.pos += 8;
      return { major, value: v };
    }
    throw new Error(`CBOR decode: unsupported info ${info}`);
  }

  read(): DecodedValue {
    const { major, value } = this.readHead();
    switch (major) {
      case 0:
        return value;
      case 1:
        return -value - 1;
      case 2: {
        const b = this.buf.subarray(this.pos, this.pos + value);
        this.pos += value;
        return Buffer.from(b);
      }
      case 3: {
        const s = this.buf.toString("utf8", this.pos, this.pos + value);
        this.pos += value;
        return s;
      }
      case 4: {
        const arr: DecodedValue[] = [];
        for (let i = 0; i < value; i++) arr.push(this.read());
        return arr;
      }
      case 5: {
        const map = new Map<number | string, DecodedValue>();
        for (let i = 0; i < value; i++) {
          const k = this.read() as number | string;
          map.set(k, this.read());
        }
        return map;
      }
      case 7:
        if (value === 20) return false;
        if (value === 21) return true;
        if (value === 22) return null;
        throw new Error(`CBOR decode: unsupported simple ${value}`);
      default:
        throw new Error(`CBOR decode: unsupported major ${major}`);
    }
  }
}

export function decode(buf: Buffer): DecodedValue {
  return new Decoder(buf).read();
}

export type CborMap = Map<number | string, DecodedValue>;
