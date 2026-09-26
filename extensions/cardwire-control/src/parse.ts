import { BinError, isRecord } from "./run-bin";

const GPU_MODES = ["integrated", "hybrid", "manual", "smart"] as const;
export type GpuMode = (typeof GPU_MODES)[number];

export type CardwireStatus = {
	current: string;
	available: string[];
};

export type Gpu = {
	id: number;
	name: string;
	pci: string;
	vendor: string;
	driver: string;
	default: boolean;
	discrete: boolean;
	blocked: boolean;
	available: boolean;
};

export type CardwireSnapshot = CardwireStatus & {
	gpus: Gpu[];
};

const GPU_MODE_SET: ReadonlySet<string> = new Set(GPU_MODES);

export function isGpuMode(value: string): value is GpuMode {
	return GPU_MODE_SET.has(value);
}

export function parseGetOutput(stdout: string): CardwireStatus {
	const currentMatch = stdout.match(/Current Mode:\s*(.+)/i);
	const availableMatch = stdout.match(/Available Mode:\s*(.+)/i);
	if (!currentMatch?.[1] || !availableMatch?.[1]) {
		throw new BinError(
			"failed",
			"cardwire",
			`Unexpected cardwire get output:\n${stdout.trim()}`,
		);
	}

	const current = currentMatch[1].trim().toLowerCase();
	const available = availableMatch[1]
		.split(",")
		.map((mode) => mode.trim().toLowerCase())
		.filter((mode) => mode.length > 0);

	if (available.length === 0) {
		throw new BinError(
			"failed",
			"cardwire",
			`No available modes in cardwire get output:\n${stdout.trim()}`,
		);
	}

	return { current, available };
}

export function parseGpuList(stdout: string): Gpu[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		throw new BinError(
			"failed",
			"cardwire",
			"cardwire list --json is not valid JSON",
		);
	}

	if (!isRecord(parsed)) {
		throw new BinError(
			"failed",
			"cardwire",
			"cardwire list --json is not an object",
		);
	}

	const gpus: Gpu[] = [];
	for (const value of Object.values(parsed)) {
		const gpu = parseGpu(value);
		if (!gpu) {
			throw new BinError(
				"failed",
				"cardwire",
				"Unexpected GPU entry in cardwire list --json",
			);
		}
		gpus.push(gpu);
	}

	gpus.sort((left, right) => left.id - right.id);
	return gpus;
}

function parseGpu(value: unknown): Gpu | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	if (
		typeof value.id !== "number" ||
		typeof value.name !== "string" ||
		typeof value.pci !== "string" ||
		typeof value.vendor !== "string" ||
		typeof value.driver !== "string" ||
		typeof value.default !== "boolean" ||
		typeof value.discrete !== "boolean" ||
		typeof value.blocked !== "boolean" ||
		typeof value.available !== "boolean"
	) {
		return undefined;
	}

	return {
		id: value.id,
		name: value.name,
		pci: value.pci,
		vendor: value.vendor,
		driver: value.driver,
		default: value.default,
		discrete: value.discrete,
		blocked: value.blocked,
		available: value.available,
	};
}
