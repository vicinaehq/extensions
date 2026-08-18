import { closeMainWindow, showHUD } from "@vicinae/api";
import { createTab, launchHelium } from "./browser";

export default async function Command() {
	await closeMainWindow();

	try {
		// Prefer the debugging endpoint: it opens the tab in the running
		// instance without stealing focus for a whole new window.
		if (await createTab()) return;

		// Fall back to singleton forwarding: launching with a URL hands it to
		// the running instance, which opens it as a new tab.
		launchHelium(["chrome://newtab/"]);
		await showHUD("Opened new Helium tab");
	} catch (error) {
		await showHUD(error instanceof Error ? error.message : "Failed to open a new tab");
	}
}
