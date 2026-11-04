import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { handleError } from "../utils/global";
import type { DisplayRect } from "./monitor-layout";

const execFileAsync = promisify(execFile);

export async function readLiveLayout() {
	const { stdout } = await execFileAsync("niri", ["msg", "--json", "outputs"]);
	return JSON.parse(stdout) as Record<string, import("../types").Output>;
}

export async function applyMonitorLayout(
	layout: DisplayRect[],
	original: DisplayRect[],
): Promise<boolean> {
	const applied: DisplayRect[] = [];
	const setPosition = (rect: DisplayRect) =>
		execFileAsync("niri", [
			"msg",
			"output",
			rect.name,
			"position",
			"set",
			String(rect.x),
			String(rect.y),
		]);
	try {
		for (const rect of layout) {
			await setPosition(rect);
			applied.push(rect);
		}
		return true;
	} catch (error) {
		const rollback = await Promise.allSettled(
			applied.map((rect) => {
				const previous = original.find((item) => item.name === rect.name);
				return previous ? setPosition(previous) : Promise.resolve();
			}),
		);
		handleError(
			rollback.some((result) => result.status === "rejected")
				? "Position update failed; refresh to check the layout"
				: "Position update failed; restored previous positions",
			error,
		);
		return false;
	}
}
