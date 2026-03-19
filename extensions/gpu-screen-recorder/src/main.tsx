import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ActionPanel,
  Action,
  Form,
  showToast,
  Toast,
  Icon,
  Cache,
  Keyboard,
  getPreferenceValues,
} from "@vicinae/api";
import {
  type RecorderMode,
  type CaptureSource,
  type QualityPreset,
  type RecorderOptions,
  getRecorderStatus,
  startRecording,
  stopRecording,
  startInstantReplay,
  saveInstantReplay,
  getAudioDevices,
  getApplicationAudio,
  getMonitors,
} from "./recorder";

type Mode = "recording" | "instant-replay";

interface Preferences {
  "gsr-path": string;
}

interface CachedSettings {
  mode: Mode;
  captureSourceType: "current-monitor" | "monitor" | "window";
  monitorId: string;
  resolution: string;
  quality: QualityPreset;
  audioInput: string;
  saveLocation: string;
  bufferSize: number;
}

const DEFAULT_SETTINGS: CachedSettings = {
  mode: "recording",
  captureSourceType: "current-monitor",
  monitorId: "",
  resolution: "",
  quality: "high",
  audioInput: "",
  saveLocation: `${process.env.HOME}/Videos`,
  bufferSize: 0,
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

function saveSettings(settings: CachedSettings): void {
  cache.set("settings", JSON.stringify(settings));
}

function StatusDisplay({ mode }: { mode: RecorderMode }) {
  const statusText: Record<RecorderMode, string> = {
    idle: "Idle",
    recording: "Recording",
    "instant-replay": "Instant Replay",
  };

  return (
    <Form.Description
      title="Status"
      text={statusText[mode]}
    />
  );
}

export default function MainView() {
  const initialSettings = useMemo(() => loadSettings(), []);

  const [mode, setMode] = useState<Mode>(initialSettings.mode);
  const [status, setStatus] = useState<RecorderMode>("idle");
  const [isLoading, setIsLoading] = useState(true);

  const [captureSourceType, setCaptureSourceType] = useState<"current-monitor" | "monitor" | "window">(initialSettings.captureSourceType);
  const [monitorId, setMonitorId] = useState(initialSettings.monitorId);
  const [resolution, setResolution] = useState(initialSettings.resolution);
  const [quality, setQuality] = useState<QualityPreset>(initialSettings.quality);
  const [audioInput, setAudioInput] = useState(initialSettings.audioInput);
  const [saveLocation, setSaveLocation] = useState(initialSettings.saveLocation);
  const [bufferSize, setBufferSize] = useState(initialSettings.bufferSize);
  const [audioDevices, setAudioDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [appAudio, setAppAudio] = useState<Array<{ id: string; name: string }>>([]);
  const [monitors, setMonitors] = useState<Array<{ id: string; resolution: string }>>([]);

  const fetchStatus = useCallback(async () => {
    const currentStatus = await getRecorderStatus();
    setStatus(currentStatus);
    if (currentStatus === "instant-replay") {
      setMode("instant-replay");
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 1000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    async function fetchAudio() {
      const preferences = getPreferenceValues<Preferences>();
      const gsrPath = preferences["gsr-path"] || undefined;
      const [devices, apps, monitorList] = await Promise.all([
        getAudioDevices(gsrPath),
        getApplicationAudio(gsrPath),
        getMonitors(gsrPath),
      ]);
      setAudioDevices(devices);
      setAppAudio(apps);
      setMonitors(monitorList);
      if (monitorList.length > 0 && !initialSettings.monitorId) {
        setMonitorId(monitorList[0].id);
        setResolution(monitorList[0].resolution);
      }
    }
    fetchAudio();
  }, []);

  const currentSettings = useMemo((): CachedSettings => ({
    mode,
    captureSourceType,
    monitorId,
    resolution,
    quality,
    audioInput,
    saveLocation,
    bufferSize,
  }), [mode, captureSourceType, monitorId, resolution, quality, audioInput, saveLocation, bufferSize]);

  const updateSetting = useCallback((key: keyof CachedSettings, value: unknown) => {
    switch (key) {
      case "mode": setMode(value as Mode); break;
      case "captureSourceType": setCaptureSourceType(value as "current-monitor" | "monitor" | "window"); break;
      case "monitorId": setMonitorId(value as string); break;
      case "resolution": setResolution(value as string); break;
      case "quality": setQuality(value as QualityPreset); break;
      case "audioInput": setAudioInput(value as string); break;
      case "saveLocation": setSaveLocation(value as string); break;
      case "bufferSize": setBufferSize(value as number); break;
    }
    const newSettings = { ...currentSettings, [key]: value };
    saveSettings(newSettings);
  }, [currentSettings]);

  const getCaptureSource = (): CaptureSource => {
    if (captureSourceType === "current-monitor") {
      return { type: "current-monitor" };
    } else if (captureSourceType === "monitor") {
      return { type: "monitor", id: monitorId };
    } else {
      return { type: "window" };
    }
  };

  const handleStart = async () => {
    try {
      if (status !== "idle") {
        await showToast({
          style: Toast.Style.Failure,
          title: "Recorder is active",
          message: "Stop the current recording first",
        });
        return;
      }

      const effectiveBufferSize = bufferSize || 60;
      const preferences = getPreferenceValues<Preferences>();
      const gsrPath = preferences["gsr-path"] || undefined;
      const options: RecorderOptions = {
        captureSource: getCaptureSource(),
        quality,
        resolution: resolution || undefined,
        audioInput: audioInput || undefined,
        saveLocation,
        bufferSize: mode === "instant-replay" ? effectiveBufferSize : undefined,
        gsrPath,
      };

      let result: { success: boolean; error?: string };
      if (mode === "recording") {
        result = await startRecording(options);
      } else {
        result = await startInstantReplay(options);
      }

      if (result.success) {
        await showToast({
          style: Toast.Style.Success,
          title: `${mode === "recording" ? "Recording" : "Instant Replay"} started`,
          message: mode === "instant-replay" ? `${effectiveBufferSize}s buffer` : undefined,
        });
        await fetchStatus();
      } else {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to start",
          message: result.error,
        });
      }
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Error",
        message: String(error),
      });
    }
  };

  const handleStop = async () => {
    try {
      const result = await stopRecording();
      if (result.success) {
        await showToast({
          style: Toast.Style.Success,
          title: "Stopped",
          message: status === "recording" ? "Recording saved" : "Instant Replay stopped",
        });
        await fetchStatus();
      } else {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to stop",
          message: result.error,
        });
      }
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Error",
        message: String(error),
      });
    }
  };

  const handleSaveReplay = async () => {
    try {
      const result = await saveInstantReplay();
      if (result.success) {
        await showToast({
          style: Toast.Style.Success,
          title: "Saved",
          message: "Last replay saved",
        });
      } else {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to save",
          message: result.error,
        });
      }
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Error",
        message: String(error),
      });
    }
  };

  const getPrimaryActionTitle = () => {
    if (status !== "idle") {
      return "Stop";
    }
    return mode === "recording" ? "Start Recording" : "Start Instant Replay";
  };

  const handlePrimaryAction = () => {
    if (status !== "idle") {
      handleStop();
    } else {
      handleStart();
    }
  };

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action
            title={getPrimaryActionTitle()}
            onAction={handlePrimaryAction}
            icon={status !== "idle" ? Icon.Stop : Icon.CircleFilled}
          />
          {status === "instant-replay" && (
            <Action
              title="Save Instant Replay"
              onAction={handleSaveReplay}
              icon={Icon.Download}
              shortcut={Keyboard.Shortcut.Common.Save}
            />
          )}
        </ActionPanel>
      }
    >
      <StatusDisplay mode={status} />

      <Form.Separator />

      <Form.Dropdown
        id="mode"
        title="Mode"
        value={mode}
        onChange={(value) => updateSetting("mode", value as Mode)}
      >
        <Form.Dropdown.Item value="recording" title="Recording" />
        <Form.Dropdown.Item value="instant-replay" title="Instant Replay" />
      </Form.Dropdown>

      {mode === "instant-replay" && (
        <Form.TextField
          id="buffer-size"
          title="Buffer (sec)"
          placeholder="60"
          value={bufferSize === 0 ? "" : String(bufferSize)}
          onChange={(value) => {
            const num = parseInt(value);
            if (value === "" || isNaN(num)) {
              setBufferSize(0);
            } else {
              setBufferSize(num);
              updateSetting("bufferSize", num);
            }
          }}
        />
      )}

      <Form.Dropdown
        id="capture-source"
        title="Capture"
        value={captureSourceType}
        onChange={(value) => updateSetting("captureSourceType", value as "current-monitor" | "monitor" | "window")}
      >
        <Form.Dropdown.Item value="current-monitor" title="Current Monitor" />
        <Form.Dropdown.Item value="monitor" title="Select Monitor" />
        <Form.Dropdown.Item value="window" title="Window (Wayland)" />
      </Form.Dropdown>

      {captureSourceType === "monitor" && (
        <Form.Dropdown
          id="monitor-id"
          title="Monitor"
          value={monitorId}
          onChange={(value) => updateSetting("monitorId", value)}
        >
          {monitors.map((m) => (
            <Form.Dropdown.Item key={m.id} value={m.id} title={`${m.id} (${m.resolution})`} />
          ))}
        </Form.Dropdown>
      )}

      <Form.Dropdown
        id="quality"
        title="Quality"
        value={quality}
        onChange={(value) => updateSetting("quality", value as QualityPreset)}
      >
        <Form.Dropdown.Item value="medium" title="Medium" />
        <Form.Dropdown.Item value="high" title="High" />
        <Form.Dropdown.Item value="very_high" title="Very High" />
        <Form.Dropdown.Item value="ultra" title="Ultra" />
      </Form.Dropdown>

      <Form.Dropdown
        id="audio-input"
        title="Audio"
        value={audioInput}
        onChange={(value) => {
          if (value && !value.startsWith("__")) {
            updateSetting("audioInput", value);
          }
        }}
      >
        <Form.Dropdown.Item value="" title="None" />
        {audioDevices.length > 0 && (
          <Form.Dropdown.Item title="──── Audio Devices ────" value="__divider__" />
        )}
        {audioDevices.map((device) => (
          <Form.Dropdown.Item key={device.id} value={device.id} title={device.name} />
        ))}
        {appAudio.length > 0 && (
          <>
            <Form.Dropdown.Item title="──── Applications ────" value="__divider2__" />
            {appAudio.map((app) => (
              <Form.Dropdown.Item key={app.id} value={app.id} title={app.name} />
            ))}
          </>
        )}
      </Form.Dropdown>

      <Form.FilePicker
        id="save-location"
        title="Save to"
        value={saveLocation ? [saveLocation] : []}
        onChange={(value) => updateSetting("saveLocation", value[0] || "")}
        canChooseDirectories={true}
        canChooseFiles={false}
      />
    </Form>
  );
}
