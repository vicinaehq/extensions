import { closeMainWindow, showHUD } from "@vicinae/api";
import { launchHelium } from "./browser";

export default async function Command() {
	await closeMainWindow();
	try {
		launchHelium([]);
		await showHUD("Opened new Helium window");
	} catch (error) {
		await showHUD(error instanceof Error ? error.message : "Failed to open a new window");
	}
}
