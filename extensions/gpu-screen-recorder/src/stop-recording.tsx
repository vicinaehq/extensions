import {
	showToast,
	Toast,
	getPreferenceValues,
	closeMainWindow,
	open,
	showInFileBrowser,
} from "@vicinae/api";
import {
	getRecorderStatus,
	stopRecording,
	getOutputPathFromProcess,
	getLatestFileInDirectory,
} from "./recorder";

interface Preferences {
	"open-after-stop-recording": boolean;
}

export default async function StopRecording() {
	const status = await getRecorderStatus();

	if (status === "idle") {
		await showToast({
			style: Toast.Style.Failure,
			title: "Not active",
			message: "No recording or instant replay to stop",
		});
		return;
	}

	const outputInfo = await getOutputPathFromProcess();
	const result = await stopRecording();

	if (result.success) {
		const preferences = getPreferenceValues<Preferences>();
		if (preferences["open-after-stop-recording"] && outputInfo) {
			if (status === "recording") {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				const latestFile = await getLatestFileInDirectory(outputInfo.directory);
				if (latestFile) {
					await showInFileBrowser(latestFile);
				} else {
					await open(outputInfo.directory);
				}
			} else {
				await open(outputInfo.directory);
			}
			await closeMainWindow();
		} else {
			await showToast({
				style: Toast.Style.Success,
				title:
					status === "recording"
						? "Recording stopped"
						: "Instant Replay stopped",
				message:
					status === "recording" ? "Recording saved" : "Instant replay stopped",
			});
		}
	} else {
		await showToast({
			style: Toast.Style.Failure,
			title: "Failed to stop",
			message: result.error,
		});
	}
}
