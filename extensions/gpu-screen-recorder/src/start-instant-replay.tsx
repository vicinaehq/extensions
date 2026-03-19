import { showToast, Toast, getPreferenceValues, Cache } from "@vicinae/api";
import {
  getRecorderStatus,
  startInstantReplay,
  type RecorderOptions,
  type QualityPreset,
  type CaptureSource,
} from "./recorder";

interface Preferences {
  "default-monitor": string;
  "default-replay-buffer-size": string;
  "quality-preset": QualityPreset;
  "audio-input": string;
  "save-location": string;
}

interface CachedSettings {
  captureSourceType: "current-monitor" | "monitor" | "window";
  monitorId: string;
  quality: QualityPreset;
  audioInput: string;
  saveLocation: string;
  bufferSize: number;
}

const DEFAULT_SETTINGS: CachedSettings = {
  captureSourceType: "current-monitor",
  monitorId: "",
  quality: "high",
  audioInput: "",
  saveLocation: `${process.env.HOME}/Videos`,
  bufferSize: 60,
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
  const bufferSize = settings.bufferSize || parseInt(prefs["default-replay-buffer-size"]) || 60;
  
  let captureSource: CaptureSource;
  if (settings.captureSourceType === "current-monitor") {
    captureSource = { type: "current-monitor" };
  } else if (settings.captureSourceType === "monitor") {
    captureSource = { type: "monitor", id: settings.monitorId || prefs["default-monitor"] };
  } else {
    captureSource = { type: "window" };
  }

  return {
    captureSource,
    quality: settings.quality,
    audioInput: settings.audioInput || undefined,
    saveLocation: settings.saveLocation || `${process.env.HOME}/Videos`,
    bufferSize,
  };
}

export default async function StartInstantReplay() {
  const status = await getRecorderStatus();

  if (status !== "idle") {
    if (status === "recording") {
      await showToast({
        style: Toast.Style.Failure,
        title: "Recording is active",
        message: "Stop the recording first",
      });
    } else {
      await showToast({
        style: Toast.Style.Failure,
        title: "Already in Instant Replay",
        message: "Instant Replay is already active",
      });
    }
    return;
  }

  const options = getOptions();
  const result = await startInstantReplay(options);

  if (result.success) {
    await showToast({
      style: Toast.Style.Success,
      title: "Instant Replay started",
      message: `${options.bufferSize}s buffer`,
    });
  } else {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to start Instant Replay",
      message: result.error,
    });
  }
}
