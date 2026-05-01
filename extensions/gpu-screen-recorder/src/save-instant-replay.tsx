import {
	showToast,
	Toast,
	getPreferenceValues,
	closeMainWindow,
	open,
} from "@vicinae/api";
import {
	getRecorderStatus,
	saveInstantReplay,
	getOutputPathFromProcess,
	getLatestFileInDirectory,
} from "./recorder";

interface Preferences {
	"open-after-save-replay": boolean;
}

export default async function SaveInstantReplay() {
	const status = await getRecorderStatus();

	if (status !== "instant-replay") {
		await showToast({
			style: Toast.Style.Failure,
			title: "Not in Instant Replay",
			message: "Start Instant Replay first to save",
		});
		return;
	}

	const outputInfo = await getOutputPathFromProcess();
	const result = await saveInstantReplay();

	if (result.success) {
		const preferences = getPreferenceValues<Preferences>();
		if (preferences["open-after-save-replay"] && outputInfo) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
			const latestFile = await getLatestFileInDirectory(outputInfo.directory);
			if (latestFile) {
				await open(latestFile);
			}
			await closeMainWindow();
		} else {
			await showToast({
				style: Toast.Style.Success,
				title: "Saved",
				message: "Last replay saved",
			});
		}
	} else {
		await showToast({
			style: Toast.Style.Failure,
			title: "Failed to save",
			message: result.error,
		});
	}
}
