import { closeMainWindow, showHUD } from "@vicinae/api";
import { launchBrave } from "./browser";
import { detectVariant, variantName } from "./utils";

export default async function Command() {
	await closeMainWindow();

	const variant = detectVariant();
	if (!variant) {
		await showHUD("No Brave or Brave Origin installation detected");
		return;
	}

	try {
		launchBrave(variant, ["--incognito"]);
		await showHUD(`Opened new private ${variantName(variant)} window`);
	} catch (error) {
		await showHUD(error instanceof Error ? error.message : "Failed to open a new private window");
	}
}