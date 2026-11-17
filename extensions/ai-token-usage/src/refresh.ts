import { type LaunchProps, LaunchType, showHUD } from "@vicinae/api";
import { loadLimits, saveLimits, saveSnapshot } from "./lib/cache";
import { fetchLimits } from "./lib/limits";
import { PROVIDERS } from "./lib/providers";
import { checkTokscale } from "./lib/tokscale";
import { fetchSnapshot } from "./lib/usage";

// Runs every 5 minutes so `tmon` opens with fresh numbers: month scan + limits into Cache.
export default async function Refresh(props: LaunchProps) {
	const background = props.launchType === LaunchType.Background;
	if ((await checkTokscale()).kind !== "ok") {
		if (!background) await showHUD("tokscale missing or too old; open AI Token Usage for instructions");
		return;
	}
	const [usage, limits] = await Promise.allSettled([fetchSnapshot(), fetchLimits(PROVIDERS, loadLimits())]);
	if (usage.status === "fulfilled") saveSnapshot(usage.value);
	if (limits.status === "fulfilled") saveLimits(limits.value);
	if (!background) await showHUD(usage.status === "fulfilled" ? "Token usage refreshed" : "Token usage unavailable");
}
