import {
	showToast,
	Toast,
	getPreferenceValues,
	Cache,
	closeMainWindow,
	open,
	showInFileBrowser,
} from "@vicinae/api";
import {
	getRecorderStatus,
	startRecording,
	stopRecording,
	getOutputPathFromProcess,
	getLatestFileInDirectory,
	type RecorderOptions,
	type QualityPreset,
	type CaptureSource,
} from "./recorder";

interface Preferences {
	"default-monitor": string;
	"default-replay-buffer-size": string;
	"quality-preset": QualityPreset;
	"audio-input": string;
	"open-after-stop-recording": boolean;
}

interface CachedSettings {
	captureSourceType: "current-monitor" | "monitor" | "window";
	monitorId: string;
	quality: QualityPreset;
	audioInput: string;
	saveLocation: string;
}

const DEFAULT_SETTINGS: CachedSettings = {
	captureSourceType: "current-monitor",
	monitorId: "",
	quality: "high",
	audioInput: "",
	saveLocation: `${process.env.HOME}/Videos`,
};

const cache = new Cache({ namespace: "settings" });

function loadSettings(): CachedSettings {
	try {
		const data = cache.get("settings");
		if (data) {
			return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
		}
	} catch {
		// ignore
	}
	return DEFAULT_SETTINGS;
}

function getOptions(): RecorderOptions {
	const prefs = getPreferenceValues<Preferences>();
	const settings = loadSettings();

	let captureSource: CaptureSource;
	if (settings.captureSourceType === "current-monitor") {
		captureSource = { type: "current-monitor" };
	} else if (settings.captureSourceType === "monitor") {
		captureSource = {
			type: "monitor",
			id: settings.monitorId || prefs["default-monitor"],
		};
	} else {
		captureSource = { type: "window" };
	}

	return {
		captureSource,
		quality: settings.quality,
		audioInput: settings.audioInput || undefined,
		saveLocation: settings.saveLocation || `${process.env.HOME}/Videos`,
	};
}

export default async function ToggleRecording() {
	const status = await getRecorderStatus();

	if (status === "idle") {
		const options = getOptions();
		const result = await startRecording(options);

		if (result.success) {
			await closeMainWindow();
		} else {
			await showToast({
				style: Toast.Style.Failure,
				title: "Failed to start recording",
				message: result.error,
			});
		}
	} else {
		const outputInfo = await getOutputPathFromProcess();
		const prefs = getPreferenceValues<Preferences>();
		const result = await stopRecording();

		if (result.success) {
			if (prefs["open-after-stop-recording"] && outputInfo) {
				if (status === "recording") {
					await new Promise((resolve) => setTimeout(resolve, 1000));
					const latestFile = await getLatestFileInDirectory(
						outputInfo.directory,
					);
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
						status === "recording"
							? "Recording saved"
							: "Instant replay stopped",
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
}
