import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class BinError extends Error {
	readonly kind: "missing-cli" | "failed";
	readonly bin: string;

	constructor(kind: "missing-cli" | "failed", bin: string, message: string) {
		super(message);
		this.name = "BinError";
		this.kind = kind;
		this.bin = bin;
	}
}

export async function runBin(
	bin: string,
	args: readonly string[],
): Promise<string> {
	try {
		const { stdout } = await execFileAsync(bin, [...args], {
			encoding: "utf8",
			timeout: 8000,
		});
		return stdout;
	} catch (error) {
		throw toBinError(error, bin);
	}
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toBinError(error: unknown, bin: string): BinError {
	if (readStringField(error, "code") === "ENOENT") {
		return new BinError(
			"missing-cli",
			bin,
			`Could not find ${bin}. Install it or set the binary path in preferences.`,
		);
	}

	const stderr = readStringField(error, "stderr")?.trim();
	if (stderr) {
		return new BinError("failed", bin, stderr);
	}

	const message = readStringField(error, "message");
	if (message) {
		return new BinError("failed", bin, message);
	}

	return new BinError("failed", bin, `${bin} failed`);
}

function readStringField(value: unknown, key: string): string | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	const field = value[key];
	return typeof field === "string" ? field : undefined;
}
