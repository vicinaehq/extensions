import { closeMainWindow, showHUD } from "@vicinae/api";
import { createTab, launchBrave } from "./browser";
import { detectVariant, variantName } from "./utils";

export default async function Command() {
	await closeMainWindow();

	const variant = detectVariant();
	if (!variant) {
		await showHUD("No Brave or Brave Origin installation detected");
		return;
	}

	try {
		if (await createTab(variant, "brave://newtab/")) return;
		launchBrave(variant, ["brave://newtab/"]);
		await showHUD(`Opened new ${variantName(variant)} tab`);
	} catch (error) {
		await showHUD(error instanceof Error ? error.message : "Failed to open a new tab");
	}
}