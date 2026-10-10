import { showHUD } from "@vicinae/api";
import { apply, fail, json } from "./lib/cli.ts";

export default async function Command() {
	try {
		// `get` reads the persisted toggle, so this also works while the app is closed.
		const current = await json<{ enabled?: boolean }>(["get", "enabled"]);
		const wasEnabled = current.enabled === true;
		await apply([wasEnabled ? "off" : "on"]);
		await showHUD(wasEnabled ? "Warming disabled" : "Warming enabled");
	} catch (error) {
		await fail(error);
	}
}