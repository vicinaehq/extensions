import { showHUD } from "@vicinae/api";
import { apply, fail, json } from "./lib/cli.ts";

export default async function Command() {
	try {
		// `get` reads the persisted setting, so this also works while the app is closed.
		const current = await json<{ cozy?: string }>(["get", "cozy"]);
		const wasOn = current.cozy === "on";
		await apply(["cozy", wasOn ? "off" : "on"]);
		await showHUD(wasOn ? "Cozy mode off" : "Cozy mode on");
	} catch (error) {
		await fail(error);
	}
}