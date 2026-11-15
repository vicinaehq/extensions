export type KdlValue = string | number | boolean | null;

export interface KdlNode {
  name: string;
  args: KdlValue[];
  props: Record<string, KdlValue>;
  children: KdlNode[];
  /** 1-based line the node starts on. */
  line: number;
  /** Verbatim source of the node, children block included. */
  text: string;
}

const NEWLINE_PATTERN = /[\n\r\u0085\u2028\u2029]/;
const SPACE_PATTERN = /[ \t\f\v\u00a0\ufeff]/;
const IDENTIFIER_TERMINATOR_PATTERN = /[\\/(){}<>;[\]=,"]/;

const MAX_CODE_POINT = 0x10ffff;

function isNewline(char: string): boolean {
  return NEWLINE_PATTERN.test(char);
}

function isSpace(char: string): boolean {
  return SPACE_PATTERN.test(char);
}

function interpretBareToken(token: string): KdlValue {
  if (token === 'true') return true;
  if (token === 'false') return false;
  if (token === 'null') return null;
  if (!/^[+-]?\d/.test(token)) return token;
  const value = Number(token.replace(/_/g, ''));
  return Number.isFinite(value) ? value : token;
}

/**
 * Reader for the subset of KDL v1 that niri accepts. It is deliberately
 * forgiving: a config niri itself rejects should still list whatever binds can
 * be read instead of failing outright.
 */
class KdlReader {
  private pos = 0;
  private readonly lineStarts: number[] = [0];

  constructor(private readonly text: string) {
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') this.lineStarts.push(i + 1);
    }
  }

  parseNodes(): KdlNode[] {
    const nodes: KdlNode[] = [];

    for (;;) {
      this.skipTrivia();
      if (this.pos >= this.text.length || this.peek() === '}') return nodes;

      if (this.startsWith('/-')) {
        this.pos += 2;
        this.skipTrivia();
        this.parseNode();
        continue;
      }

      const node = this.parseNode();
      if (node) nodes.push(node);
    }
  }

  private peek(offset = 0): string {
    return this.text[this.pos + offset] ?? '';
  }

  private startsWith(needle: string): boolean {
    return this.text.startsWith(needle, this.pos);
  }

  private lineAt(index: number): number {
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if ((this.lineStarts[mid] ?? 0) <= index) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  }

  private parseNode(): KdlNode | null {
    const start = this.pos;
    this.skipTypeAnnotation();
    const name = this.readIdentifier();
    if (name === null) {
      this.pos++;
      return null;
    }

    const args: KdlValue[] = [];
    const props: Record<string, KdlValue> = {};
    let children: KdlNode[] = [];

    for (;;) {
      this.skipNodeSpace();
      const char = this.peek();

      if (char === '' || isNewline(char) || char === '}') break;
      if (char === ';') {
        this.pos++;
        break;
      }

      if (this.startsWith('/-')) {
        this.pos += 2;
        this.skipNodeSpace();
        if (this.peek() === '{') this.skipChildrenBlock();
        else if (this.readEntry() === null) this.pos++;
        continue;
      }

      if (char === '{') {
        this.pos++;
        children = this.parseNodes();
        if (this.peek() === '}') this.pos++;
        this.skipNodeSpace();
        if (this.peek() === ';') this.pos++;
        break;
      }

      const entry = this.readEntry();
      if (entry === null) {
        this.pos++;
        continue;
      }
      if (entry.name === null) args.push(entry.value);
      else props[entry.name] = entry.value;
    }

    return {
      name,
      args,
      props,
      children,
      line: this.lineAt(start),
      text: this.text.slice(start, this.pos).trim(),
    };
  }

  private readEntry(): { name: string | null; value: KdlValue } | null {
    const first = this.readValue();
    if (first === null) return null;
    if (this.peek() !== '=') return { name: null, value: first.value };

    this.pos++;
    const second = this.readValue();
    if (second === null) return { name: null, value: first.value };
    return { name: String(first.value), value: second.value };
  }

  private readValue(): { value: KdlValue } | null {
    this.skipTypeAnnotation();

    if (this.peek() === '"') return { value: this.readQuotedString() };

    if (this.peek() === 'r' && (this.peek(1) === '"' || this.peek(1) === '#')) {
      const raw = this.readRawString();
      if (raw !== null) return { value: raw };
    }

    const token = this.readIdentifier();
    return token === null ? null : { value: interpretBareToken(token) };
  }

  private readIdentifier(): string | null {
    if (this.peek() === '"') return this.readQuotedString();

    const start = this.pos;
    while (this.pos < this.text.length) {
      const char = this.peek();
      if (isSpace(char) || isNewline(char) || IDENTIFIER_TERMINATOR_PATTERN.test(char)) break;
      this.pos++;
    }
    return this.pos > start ? this.text.slice(start, this.pos) : null;
  }

  private readQuotedString(): string {
    this.pos++;
    let value = '';

    while (this.pos < this.text.length) {
      const char = this.peek();
      if (char === '"') {
        this.pos++;
        return value;
      }
      if (char === '\\') {
        this.pos++;
        value += this.readEscape();
        continue;
      }
      value += char;
      this.pos++;
    }
    return value;
  }

  private readEscape(): string {
    const char = this.peek();
    this.pos++;

    switch (char) {
      case 'n':
        return '\n';
      case 't':
        return '\t';
      case 'r':
        return '\r';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case 'u': {
        if (this.peek() !== '{') return char;
        const end = this.text.indexOf('}', this.pos);
        if (end === -1) return '';
        const code = Number.parseInt(this.text.slice(this.pos + 1, end), 16);
        this.pos = end + 1;
        return Number.isNaN(code) || code > MAX_CODE_POINT ? '' : String.fromCodePoint(code);
      }
      default:
        return char;
    }
  }

  private readRawString(): string | null {
    const start = this.pos;
    this.pos++;

    let hashes = 0;
    while (this.peek() === '#') {
      hashes++;
      this.pos++;
    }

    if (this.peek() !== '"') {
      this.pos = start;
      return null;
    }
    this.pos++;

    const terminator = `"${'#'.repeat(hashes)}`;
    const end = this.text.indexOf(terminator, this.pos);
    if (end === -1) {
      this.pos = start;
      return null;
    }

    const value = this.text.slice(this.pos, end);
    this.pos = end + terminator.length;
    return value;
  }

  private skipTypeAnnotation(): void {
    if (this.peek() !== '(') return;
    const end = this.text.indexOf(')', this.pos);
    if (end !== -1) this.pos = end + 1;
  }

  private skipChildrenBlock(): void {
    this.pos++;
    this.parseNodes();
    if (this.peek() === '}') this.pos++;
  }

  private skipBlockComment(): void {
    this.pos += 2;
    let depth = 1;

    while (this.pos < this.text.length && depth > 0) {
      if (this.startsWith('/*')) {
        depth++;
        this.pos += 2;
      } else if (this.startsWith('*/')) {
        depth--;
        this.pos += 2;
      } else {
        this.pos++;
      }
    }
  }

  private skipLineComment(): void {
    while (this.pos < this.text.length && !isNewline(this.peek())) this.pos++;
  }

  /** Whitespace that keeps the current node open. The newline is left in place. */
  private skipNodeSpace(): void {
    for (;;) {
      if (isSpace(this.peek())) {
        this.pos++;
        continue;
      }
      if (this.startsWith('/*')) {
        this.skipBlockComment();
        continue;
      }
      if (this.startsWith('//')) {
        this.skipLineComment();
        continue;
      }
      if (this.peek() === '\\') {
        this.pos++;
        this.skipEscline();
        continue;
      }
      return;
    }
  }

  private skipEscline(): void {
    for (;;) {
      if (isSpace(this.peek())) {
        this.pos++;
        continue;
      }
      if (this.startsWith('/*')) {
        this.skipBlockComment();
        continue;
      }
      if (this.startsWith('//')) this.skipLineComment();
      break;
    }

    if (this.peek() === '\r' && this.peek(1) === '\n') this.pos += 2;
    else if (isNewline(this.peek())) this.pos++;
  }

  private skipTrivia(): void {
    for (;;) {
      const char = this.peek();
      if (isSpace(char) || isNewline(char) || char === ';') {
        this.pos++;
        continue;
      }
      if (this.startsWith('/*')) {
        this.skipBlockComment();
        continue;
      }
      if (this.startsWith('//')) {
        this.skipLineComment();
        continue;
      }
      if (char === '\\') {
        this.pos++;
        this.skipEscline();
        continue;
      }
      return;
    }
  }
}

export function parseKdl(source: string): KdlNode[] {
  return new KdlReader(source).parseNodes();
}
