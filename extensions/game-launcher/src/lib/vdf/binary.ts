/**
 * Reader for Valve's binary KeyValues format, as embedded in Steam's
 * appcache/appinfo.vdf.
 *
 * Each field is: <type: u8> <key> <value>, and an object ends with a
 * 0x08 (or 0x0B) type byte. Keys are either NUL-terminated UTF-8 strings or,
 * in appinfo.vdf v29+, u32 indices into a shared string table.
 */

export type BinaryVdfValue = string | number | bigint | BinaryVdfObject;
export interface BinaryVdfObject {
  [key: string]: BinaryVdfValue;
}

const enum FieldType {
  Object = 0x00,
  String = 0x01,
  Int32 = 0x02,
  Float32 = 0x03,
  Pointer = 0x04,
  WideString = 0x05,
  Color = 0x06,
  UInt64 = 0x07,
  End = 0x08,
  Int64 = 0x0a,
  EndAlt = 0x0b,
}

export class BinaryVdfError extends Error {
  constructor(message: string, readonly offset: number) {
    super(`${message} (at offset ${offset})`);
    this.name = "BinaryVdfError";
  }
}

export class BinaryReader {
  offset: number;
  constructor(readonly buf: Buffer, offset = 0) {
    this.offset = offset;
  }

  private need(bytes: number): void {
    if (this.offset + bytes > this.buf.length) {
      throw new BinaryVdfError(`Unexpected end of data (wanted ${bytes} bytes)`, this.offset);
    }
  }

  u8(): number {
    this.need(1);
    return this.buf.readUInt8(this.offset++);
  }
  u32(): number {
    this.need(4);
    const v = this.buf.readUInt32LE(this.offset);
    this.offset += 4;
    return v;
  }
  i32(): number {
    this.need(4);
    const v = this.buf.readInt32LE(this.offset);
    this.offset += 4;
    return v;
  }
  f32(): number {
    this.need(4);
    const v = this.buf.readFloatLE(this.offset);
    this.offset += 4;
    return v;
  }
  u64(): bigint {
    this.need(8);
    const v = this.buf.readBigUInt64LE(this.offset);
    this.offset += 8;
    return v;
  }
  i64(): bigint {
    this.need(8);
    const v = this.buf.readBigInt64LE(this.offset);
    this.offset += 8;
    return v;
  }
  skip(bytes: number): void {
    this.need(bytes);
    this.offset += bytes;
  }
  cstring(): string {
    const end = this.buf.indexOf(0, this.offset);
    if (end === -1) throw new BinaryVdfError("Unterminated string", this.offset);
    const s = this.buf.toString("utf8", this.offset, end);
    this.offset = end + 1;
    return s;
  }
  /** NUL-terminated UTF-16LE string (two zero bytes on a code-unit boundary). */
  wstring(): string {
    let end = this.offset;
    while (true) {
      if (end + 1 >= this.buf.length) throw new BinaryVdfError("Unterminated wide string", this.offset);
      if (this.buf[end] === 0 && this.buf[end + 1] === 0) break;
      end += 2;
    }
    const s = this.buf.toString("utf16le", this.offset, end);
    this.offset = end + 2;
    return s;
  }
}

/**
 * Read binary KeyValues fields until the terminating End byte.
 * @param stringTable when provided, keys are u32 indices into this table (appinfo v29).
 */
export function readBinaryVdf(reader: BinaryReader, stringTable?: readonly string[]): BinaryVdfObject {
  const readKey = (): string => {
    if (!stringTable) return reader.cstring();
    const at = reader.offset;
    const idx = reader.u32();
    const key = stringTable[idx];
    if (key === undefined) throw new BinaryVdfError(`String table index ${idx} out of range`, at);
    return key;
  };

  const root: BinaryVdfObject = {};
  const stack: BinaryVdfObject[] = [root];

  while (stack.length > 0) {
    const current = stack[stack.length - 1]!;
    const at = reader.offset;
    const type = reader.u8();
    if (type === FieldType.End || type === FieldType.EndAlt) {
      stack.pop();
      continue;
    }
    const key = readKey();
    switch (type) {
      case FieldType.Object: {
        const child: BinaryVdfObject = {};
        current[key] = child;
        stack.push(child);
        break;
      }
      case FieldType.String:
        current[key] = reader.cstring();
        break;
      case FieldType.WideString:
        current[key] = reader.wstring();
        break;
      case FieldType.Int32:
      case FieldType.Pointer:
      case FieldType.Color:
        current[key] = reader.i32();
        break;
      case FieldType.Float32:
        current[key] = reader.f32();
        break;
      case FieldType.UInt64:
        current[key] = reader.u64();
        break;
      case FieldType.Int64:
        current[key] = reader.i64();
        break;
      default:
        throw new BinaryVdfError(`Unknown field type 0x${type.toString(16)}`, at);
    }
  }
  return root;
}
