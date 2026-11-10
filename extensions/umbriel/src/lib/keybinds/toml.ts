export type TomlValue = string | number | boolean | TomlValue[] | TomlTable;

export interface TomlTable {
	[key: string]: TomlValue;
}

export interface TomlAssignment {
	/** Full path from the document root, for example ["keybinds", "Mod+T"]. */
	path: string[];
	value: TomlValue;
	line: number;
	text: string;
}

export interface TomlDocument {
	data: TomlTable;
	assignments: TomlAssignment[];
}

export class TomlParseError extends Error {
	constructor(
		message: string,
		readonly line: number,
	) {
		super(`Line ${line}: ${message}`);
		this.name = "TomlParseError";
	}
}

const BARE_KEY = /[A-Za-z0-9_-]/;
const BARE_VALUE_STOP = /[\s,\]}#]/;

function isTable(value: TomlValue | undefined): value is TomlTable {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureTable(node: TomlTable, key: string): TomlTable {
	const existing = node[key];
	if (Array.isArray(existing)) {
		const last = existing[existing.length - 1];
		if (isTable(last)) return last;
		const table: TomlTable = {};
		existing.push(table);
		return table;
	}
	if (isTable(existing)) return existing;
	const table: TomlTable = {};
	node[key] = table;
	return table;
}

function assign(target: TomlTable, path: string[], value: TomlValue): void {
	if (path.length === 0) return;
	let node = target;
	for (const key of path.slice(0, -1)) {
		node = ensureTable(node, key);
	}
	node[path[path.length - 1] ?? ""] = value;
}

function normalizeBareValue(token: string): TomlValue {
	const compact = token.replace(/_/g, "");
	if (compact === "true") return true;
	if (compact === "false") return false;
	if (/^[+-]?\d+$/.test(compact)) return Number(compact);
	if (/^[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?$/.test(compact)) {
		return Number(compact);
	}
	if (compact === "inf" || compact === "+inf") return Number.POSITIVE_INFINITY;
	if (compact === "-inf") return Number.NEGATIVE_INFINITY;
	if (compact === "nan" || compact === "+nan" || compact === "-nan")
		return Number.NaN;
	return token;
}

class TomlParser {
	private pos = 0;
	private line = 1;
	private readonly data: TomlTable = {};
	private readonly assignments: TomlAssignment[] = [];

	constructor(private readonly source: string) {}

	parse(): TomlDocument {
		let current: TomlTable = this.data;
		let currentPath: string[] = [];

		for (;;) {
			this.skipTrivia();
			if (this.eof()) break;

			if (this.peek() === "[") {
				const header = this.parseHeader();
				current = header.table;
				currentPath = header.path;
				continue;
			}

			const start = this.pos;
			const startLine = this.line;
			const path = this.parseKeyPath();
			this.skipInlineSpace();
			this.expect("=");
			this.skipInlineSpace();
			const value = this.parseValue();
			const text = this.source.slice(start, this.pos).trim();

			assign(current, path, value);
			this.assignments.push({
				path: [...currentPath, ...path],
				value,
				line: startLine,
				text,
			});

			this.finishStatement();
		}

		return { data: this.data, assignments: this.assignments };
	}

	private parseHeader(): { table: TomlTable; path: string[] } {
		this.expect("[");
		const isArray = this.peek() === "[";
		if (isArray) this.advance();

		const path = this.parseKeyPath();
		this.skipInlineSpace();
		this.expect("]");
		if (isArray) this.expect("]");
		this.finishStatement();

		if (isArray) {
			const table = this.openArrayTable(path);
			return { table, path };
		}

		return { table: this.resolveTable(path), path };
	}

	private resolveTable(path: string[]): TomlTable {
		let node = this.data;
		for (const key of path) {
			node = ensureTable(node, key);
		}
		return node;
	}

	private openArrayTable(path: string[]): TomlTable {
		let parent = this.data;
		for (const key of path.slice(0, -1)) {
			parent = ensureTable(parent, key);
		}

		const last = path[path.length - 1] ?? "";
		let entries = parent[last];
		if (!Array.isArray(entries)) {
			entries = [];
			parent[last] = entries;
		}

		const table: TomlTable = {};
		entries.push(table);
		return table;
	}

	private parseKeyPath(): string[] {
		const parts: string[] = [];

		for (;;) {
			this.skipInlineSpace();
			parts.push(this.parseKeySegment());
			this.skipInlineSpace();
			if (this.peek() !== ".") break;
			this.advance();
		}

		return parts;
	}

	private parseKeySegment(): string {
		const char = this.peek();
		if (char === '"') return this.parseBasicString();
		if (char === "'") return this.parseLiteralString();

		const start = this.pos;
		while (!this.eof() && BARE_KEY.test(this.peek())) {
			this.advance();
		}
		if (this.pos === start) {
			throw new TomlParseError(
				`Expected a key, found ${JSON.stringify(char)}`,
				this.line,
			);
		}
		return this.source.slice(start, this.pos);
	}

	private parseValue(): TomlValue {
		const char = this.peek();

		if (char === '"') {
			return this.source.startsWith('"""', this.pos)
				? this.parseMultilineBasicString()
				: this.parseBasicString();
		}
		if (char === "'") {
			return this.source.startsWith("'''", this.pos)
				? this.parseMultilineLiteralString()
				: this.parseLiteralString();
		}
		if (char === "[") return this.parseArray();
		if (char === "{") return this.parseInlineTable();

		return this.parseBareValue();
	}

	private parseBareValue(): TomlValue {
		const start = this.pos;
		while (!this.eof() && !BARE_VALUE_STOP.test(this.peek())) {
			this.advance();
		}
		const token = this.source.slice(start, this.pos);
		if (!token) {
			throw new TomlParseError("Expected a value", this.line);
		}
		return normalizeBareValue(token);
	}

	private parseArray(): TomlValue[] {
		this.expect("[");
		const values: TomlValue[] = [];

		for (;;) {
			this.skipTrivia();
			if (this.peek() === "]") {
				this.advance();
				return values;
			}
			if (this.eof()) throw new TomlParseError("Unterminated array", this.line);

			values.push(this.parseValue());
			this.skipTrivia();

			if (this.peek() === ",") {
				this.advance();
				continue;
			}
			if (this.peek() === "]") {
				this.advance();
				return values;
			}
			throw new TomlParseError(
				"Expected a comma or closing bracket in array",
				this.line,
			);
		}
	}

	private parseInlineTable(): TomlTable {
		this.expect("{");
		const table: TomlTable = {};

		for (;;) {
			this.skipTrivia();
			if (this.peek() === "}") {
				this.advance();
				return table;
			}
			if (this.eof())
				throw new TomlParseError("Unterminated inline table", this.line);

			const path = this.parseKeyPath();
			this.skipInlineSpace();
			this.expect("=");
			this.skipInlineSpace();
			assign(table, path, this.parseValue());
			this.skipTrivia();

			if (this.peek() === ",") {
				this.advance();
				continue;
			}
			if (this.peek() === "}") {
				this.advance();
				return table;
			}
			throw new TomlParseError(
				"Expected a comma or closing brace in inline table",
				this.line,
			);
		}
	}

	private parseBasicString(): string {
		this.expect('"');
		let value = "";

		for (;;) {
			if (this.eof())
				throw new TomlParseError("Unterminated string", this.line);
			const char = this.peek();
			if (char === '"') {
				this.advance();
				return value;
			}
			if (char === "\\") {
				this.advance();
				value += this.parseEscape();
				continue;
			}
			value += char;
			this.advance();
		}
	}

	private parseLiteralString(): string {
		this.expect("'");
		let value = "";

		for (;;) {
			if (this.eof())
				throw new TomlParseError("Unterminated literal string", this.line);
			const char = this.peek();
			if (char === "'") {
				this.advance();
				return value;
			}
			value += char;
			this.advance();
		}
	}

	private parseMultilineBasicString(): string {
		this.pos += 3;
		this.skipLeadingNewline();
		let value = "";

		for (;;) {
			if (this.eof())
				throw new TomlParseError("Unterminated multiline string", this.line);
			if (this.source.startsWith('"""', this.pos)) {
				this.pos += 3;
				return value;
			}
			const char = this.peek();
			if (char === "\\") {
				this.advance();
				if (this.peek() === "\n" || this.peek() === "\r") {
					this.skipTrivia();
					continue;
				}
				value += this.parseEscape();
				continue;
			}
			value += char;
			this.advance();
		}
	}

	private parseMultilineLiteralString(): string {
		this.pos += 3;
		this.skipLeadingNewline();
		const end = this.source.indexOf("'''", this.pos);
		if (end === -1)
			throw new TomlParseError(
				"Unterminated multiline literal string",
				this.line,
			);
		const value = this.source.slice(this.pos, end);
		const newlines = this.source.slice(this.pos, end).split("\n").length - 1;
		this.pos = end + 3;
		this.line += newlines;
		return value;
	}

	private skipLeadingNewline(): void {
		if (this.peek() === "\r" && this.peek(1) === "\n") {
			this.pos += 2;
			this.line++;
		} else if (this.peek() === "\n") {
			this.pos++;
			this.line++;
		}
	}

	private parseEscape(): string {
		const char = this.peek();
		this.advance();

		switch (char) {
			case "b":
				return "\b";
			case "t":
				return "\t";
			case "n":
				return "\n";
			case "f":
				return "\f";
			case "r":
				return "\r";
			case '"':
				return '"';
			case "\\":
				return "\\";
			case "u":
				return this.parseUnicodeEscape(4);
			case "U":
				return this.parseUnicodeEscape(8);
			default:
				return char;
		}
	}

	private parseUnicodeEscape(length: number): string {
		const hex = this.source.slice(this.pos, this.pos + length);
		if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(hex)) return "";
		this.pos += length;
		const codePoint = Number.parseInt(hex, 16);
		if (codePoint > 0x10ffff) return "";
		return String.fromCodePoint(codePoint);
	}

	private finishStatement(): void {
		for (;;) {
			if (this.peek() === " " || this.peek() === "\t" || this.peek() === "\r") {
				this.pos++;
				continue;
			}
			if (this.peek() === "#") {
				while (!this.eof() && this.peek() !== "\n") this.pos++;
				continue;
			}
			if (this.peek() === "\n") {
				this.pos++;
				this.line++;
				return;
			}
			if (this.eof()) return;
			throw new TomlParseError(
				`Unexpected ${JSON.stringify(this.peek())} after value`,
				this.line,
			);
		}
	}

	private skipInlineSpace(): void {
		for (;;) {
			const char = this.peek();
			if (char === " " || char === "\t" || char === "\r") {
				this.pos++;
				continue;
			}
			break;
		}
	}

	private skipTrivia(): void {
		for (;;) {
			const char = this.peek();
			if (char === " " || char === "\t" || char === "\r") {
				this.pos++;
				continue;
			}
			if (char === "\n") {
				this.pos++;
				this.line++;
				continue;
			}
			if (char === "#") {
				while (!this.eof() && this.peek() !== "\n") this.pos++;
				continue;
			}
			break;
		}
	}

	private expect(char: string): void {
		if (this.peek() !== char) {
			throw new TomlParseError(
				`Expected ${JSON.stringify(char)}, found ${JSON.stringify(this.peek())}`,
				this.line,
			);
		}
		this.advance();
	}

	private advance(): void {
		if (this.source[this.pos] === "\n") this.line++;
		this.pos++;
	}

	private peek(offset = 0): string {
		return this.source[this.pos + offset] ?? "";
	}

	private eof(): boolean {
		return this.pos >= this.source.length;
	}
}

export function parseToml(source: string): TomlDocument {
	return new TomlParser(source).parse();
}

/** Parses a single TOML value, used by the line-oriented fallback reader. */
export function parseTomlValue(source: string): TomlValue {
	const document = parseToml(`value = ${source}\n`);
	return document.data.value ?? "";
}
