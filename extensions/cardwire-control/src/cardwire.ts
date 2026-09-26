import { getPreferenceValues } from "@vicinae/api";
import { parseGetOutput, parseGpuList, type CardwireSnapshot } from "./parse";
import { runBin } from "./run-bin";

export {
	isGpuMode,
	type CardwireSnapshot,
	type Gpu,
	type GpuMode,
} from "./parse";
export { BinError } from "./run-bin";

type Preferences = {
	cardwirePath?: string;
};

export async function loadSnapshot(): Promise<CardwireSnapshot> {
	const [statusStdout, listStdout] = await Promise.all([
		runCardwire(["get"]),
		runCardwire(["list", "--json"]),
	]);
	return {
		...parseGetOutput(statusStdout),
		gpus: parseGpuList(listStdout),
	};
}

export async function setMode(mode: string): Promise<void> {
	await runCardwire(["set", mode]);
}

export async function setGpuBlocked(
	id: number,
	blocked: boolean,
): Promise<void> {
	await runCardwire(["gpu", blocked ? "--block" : "--unblock", String(id)]);
}

function runCardwire(args: readonly string[]): Promise<string> {
	return runBin(cardwireBin(), args);
}

function cardwireBin(): string {
	const { cardwirePath } = getPreferenceValues<Preferences>();
	const trimmed = cardwirePath?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : "cardwire";
}
