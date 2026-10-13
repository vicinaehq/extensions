import { showHUD } from "@vicinae/api";
import { apply, fail } from "./lib/cli.ts";

export default async function Command() {
	try {
		await apply(["off"]);
		await showHUD("Warming disabled");
	} catch (error) {
		await fail(error);
	}
}