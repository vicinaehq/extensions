import { getPreferenceValues } from "@vicinae/api";
import {
	type AsusdSnapshot,
	type ProfilePower,
	parseArmouryChoices,
	parseBatteryInfo,
	parseProfileGet,
	parseProfileList,
} from "./asusd-parse";
import { BinError, runBin } from "./run-bin";

export type { AsusdSnapshot, ProfilePower, ProfileStatus } from "./asusd-parse";
export { BinError } from "./run-bin";

type Preferences = {
	asusctlPath?: string;
};

export async function loadAsusdSnapshot(): Promise<AsusdSnapshot> {
	const [profileListOut, profileGetOut, batteryOut] = await Promise.all([
		runAsusctl(["profile", "list"]),
		runAsusctl(["profile", "get"]),
		runAsusctl(["battery", "info"]),
	]);

	return {
		profiles: {
			...parseProfileGet(profileGetOut),
			available: parseProfileList(profileListOut),
		},
		chargeLimit: parseBatteryInfo(batteryOut),
		dgpuDisable: await loadDgpuDisable(),
	};
}

export async function setProfile(
	profile: string,
	power: ProfilePower,
): Promise<void> {
	switch (power) {
		case "active":
			await runAsusctl(["profile", "set", profile]);
			return;
		case "ac":
			await runAsusctl(["profile", "set", "-a", profile]);
			return;
		case "battery":
			await runAsusctl(["profile", "set", "-b", profile]);
			return;
		default: {
			const _exhaustive: never = power;
			return _exhaustive;
		}
	}
}

export async function setChargeLimit(limit: number): Promise<void> {
	await runAsusctl(["battery", "limit", String(limit)]);
}

export async function setDgpuDisabled(disabled: boolean): Promise<void> {
	await runAsusctl(["armoury", "set", "dgpu_disable", disabled ? "1" : "0"]);
}

async function loadDgpuDisable(): Promise<AsusdSnapshot["dgpuDisable"]> {
	try {
		return parseArmouryChoices(
			await runAsusctl(["armoury", "get", "dgpu_disable"]),
		);
	} catch (error) {
		if (error instanceof BinError && error.kind === "missing-cli") {
			throw error;
		}
		return undefined;
	}
}

function runAsusctl(args: readonly string[]): Promise<string> {
	return runBin(asusctlBin(), args);
}

function asusctlBin(): string {
	const { asusctlPath } = getPreferenceValues<Preferences>();
	const trimmed = asusctlPath?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : "asusctl";
}
