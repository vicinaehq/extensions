import { showHUD } from "@vicinae/api";
import { apply, fail } from "./lib/cli.ts";

export default async function Command() {
	try {
		await apply(["on"]);
		await showHUD("Warming enabled");
	} catch (error) {
		await fail(error);
	}
}