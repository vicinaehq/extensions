import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { showToast, showHUD, Toast } from "@vicinae/api";

const execFileAsync = promisify(execFile);

export default async function Command() {
	try {
		await execFileAsync("osascript", ["-e", 'quit app "Abendrot"'], {
			encoding: "utf8",
			timeout: 5_000,
		});
		await showHUD("Abendrot quit");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		// osascript error -600: the target application is not running.
		const friendly = /isn't running|-600/.test(message) ? "Abendrot is not running" : message;
		await showToast({ style: Toast.Style.Failure, title: "Abendrot", message: friendly });
	}
}