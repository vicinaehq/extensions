import { existsSync, rmSync, statSync } from "node:fs";
import { CaptureCancelled } from "./errors";
import type { CaptureBackend, CaptureMode } from "./types";
import { isCommandAvailable, looksCancelled, runCaptureToFile } from "./utils";

export const flameshotBackend: CaptureBackend = {
	id: "flameshot",
	displayName: "flameshot",
	supportedModes: ["area", "full"],

	isAvailable: () => isCommandAvailable("flameshot"),

	capture: async (mode: CaptureMode, outputPath: string) => {
		// `--raw` streams the PNG on stdout, which goes straight to the output
		// file descriptor. The previous shell redirection could not work on
		// Windows, where flameshot is the only backend offering area capture.
		const args = mode === "area" ? ["gui", "--raw"] : ["screen", "--raw"];
		let failure: unknown = null;
		try {
			runCaptureToFile("flameshot", args, outputPath);
		} catch (e) {
			failure = e;
		}

		// A dismissed selection exits non-zero having streamed nothing, leaving
		// behind the empty file the redirection just created.
		const written = existsSync(outputPath) ? statSync(outputPath).size : 0;
		if (written > 0) return;

		rmSync(outputPath, { force: true });
		// An exit code of zero with nothing streamed is a dismissal too, so a
		// missing failure counts as one; anything else that is not recognisably a
		// cancellation — flameshot absent from PATH, above all — is reported.
		if (failure !== null && !looksCancelled(failure)) throw failure;
		throw new CaptureCancelled("flameshot capture cancelled");
	},
};
