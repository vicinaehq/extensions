import { execFile } from "node:child_process";

export const MIN_TOKSCALE_VERSION = "4.22.0";
export const INSTALL_COMMAND = "bun add -g tokscale";

export type TokscaleStatus =
	| { kind: "ok"; version: string }
	| { kind: "missing" }
	| { kind: "outdated"; version: string }
	| { kind: "unknown-version"; output: string };

export function parseVersion(output: string): string | null {
	return output.match(/(\d+)\.(\d+)\.(\d+)/)?.[0] ?? null;
}

// true when `version` >= `min`; both are plain x.y.z
export function isAtLeast(version: string, min: string): boolean {
	const a = version.split(".").map(Number);
	const b = min.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		if (a[i] !== b[i]) return a[i] > b[i];
	}
	return true;
}

export function statusFromVersionOutput(output: string): TokscaleStatus {
	const version = parseVersion(output);
	if (!version) return { kind: "unknown-version", output: output.trim() };
	return isAtLeast(version, MIN_TOKSCALE_VERSION)
		? { kind: "ok", version }
		: { kind: "outdated", version };
}

export function checkTokscale(): Promise<TokscaleStatus> {
	return new Promise((resolve) => {
		execFile("tokscale", ["--version"], { timeout: 10_000 }, (error, stdout) => {
			if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
				resolve({ kind: "missing" });
			} else if (error) {
				resolve({ kind: "unknown-version", output: error.message });
			} else {
				resolve(statusFromVersionOutput(stdout));
			}
		});
	});
}
