import { BinError } from "./run-bin";

export type ProfilePower = "active" | "ac" | "battery";

export type ProfileStatus = {
	active: string;
	ac: string | undefined;
	battery: string | undefined;
	available: string[];
};

export type ArmouryChoices = {
	current: number;
	options: number[];
};

export type AsusdSnapshot = {
	profiles: ProfileStatus;
	chargeLimit: number;
	dgpuDisable: ArmouryChoices | undefined;
};

export function stripLogLines(stdout: string): string {
	return stdout
		.split("\n")
		.filter((line) => !line.startsWith("[WARN") && !line.startsWith("[INFO"))
		.join("\n")
		.trim();
}

export function parseProfileList(stdout: string): string[] {
	const available = stripLogLines(stdout)
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	if (available.length === 0) {
		throw new BinError(
			"failed",
			"asusctl",
			"No profiles from asusctl profile list",
		);
	}
	return available;
}

export function parseProfileGet(stdout: string): {
	active: string;
	ac: string | undefined;
	battery: string | undefined;
} {
	const cleaned = stripLogLines(stdout);
	const active = cleaned.match(/Active profile:\s*(.+)/i)?.[1]?.trim();
	if (!active) {
		throw new BinError(
			"failed",
			"asusctl",
			`Unexpected asusctl profile get output:\n${cleaned}`,
		);
	}
	return {
		active,
		ac: cleaned.match(/AC profile\s+(.+)/i)?.[1]?.trim(),
		battery: cleaned.match(/Battery profile\s+(.+)/i)?.[1]?.trim(),
	};
}

export function parseBatteryInfo(stdout: string): number {
	const cleaned = stripLogLines(stdout);
	const match = cleaned.match(/Current battery charge limit:\s*(\d+)%/i);
	if (!match?.[1]) {
		throw new BinError(
			"failed",
			"asusctl",
			`Unexpected asusctl battery info output:\n${cleaned}`,
		);
	}
	return Number(match[1]);
}

export function parseArmouryChoices(stdout: string): ArmouryChoices {
	const cleaned = stripLogLines(stdout);
	const match = cleaned.match(/current:\s*\[([^\]]+)\]/);
	if (!match?.[1]) {
		throw new BinError(
			"failed",
			"asusctl",
			`Unexpected asusctl armoury output:\n${cleaned}`,
		);
	}
	return parseChoiceList(match[1]);
}

function parseChoiceList(inner: string): ArmouryChoices {
	const options: number[] = [];
	let current: number | undefined;
	for (const token of inner.split(",")) {
		const trimmed = token.trim();
		const wrapped = trimmed.match(/^\((\d+)\)$/);
		if (wrapped) {
			const value = Number(wrapped[1]);
			options.push(value);
			current = value;
			continue;
		}
		if (/^\d+$/.test(trimmed)) {
			options.push(Number(trimmed));
			continue;
		}
		throw new BinError(
			"failed",
			"asusctl",
			`Unexpected armoury choice token: ${trimmed}`,
		);
	}
	if (current === undefined || options.length === 0) {
		throw new BinError(
			"failed",
			"asusctl",
			`No current value in armoury choices: [${inner}]`,
		);
	}
	return { current, options };
}
