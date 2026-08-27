import {
  Form,
  ActionPanel,
  Action,
  useNavigation,
  confirmAlert,
  Alert,
} from "@vicinae/api";
import type { Output } from "./types";
import { COMMON_SCALES, TRANSFORMS } from "./types";
import { normalizeTransform, formatMode, showSuccess } from "./global-utils";
import { upsertOutputConfig } from "./upsert-output-config";

interface Props {
  monitor: Output;
  enabledCount: number;
  onRefresh?: () => Promise<void>;
}

interface FormValues {
  enabled?: boolean;
  mode: string;
  scale: string;
  transform: string;
}

export default function PersistMonitorConfig({
  monitor,
  enabledCount,
  onRefresh,
}: Props) {
  const { pop } = useNavigation();

  const isEnabled = monitor.logical !== null;
  const canToggle = !isEnabled || enabledCount > 1;

  const currentScale = monitor.logical?.scale ?? 1.0;
  const currentTransform = normalizeTransform(
    monitor.logical?.transform ?? "normal",
  );
  const currentMode = monitor.modes[monitor.current_mode] ?? monitor.modes[0];
  const currentResolution = currentMode ? formatMode(currentMode) : "";

  const saveConfig = async (values: Form.Values) => {
    const formValues = values as unknown as FormValues;

    const confirmed = await confirmAlert({
      title: "Save to Niri Config?",
      message:
        "This writes directly to your niri config file, so it persists across restarts. For a one-off change that resets on reboot, go back and use the quick actions instead.",
      primaryAction: {
        title: "Save",
        style: Alert.ActionStyle.Default,
      },
    });

    if (!confirmed) return;

    const success = await upsertOutputConfig(monitor.name, {
      enabled: canToggle ? (formValues.enabled ?? true) : true,
      mode: formValues.mode,
      scale: parseFloat(formValues.scale),
      transform: formValues.transform,
    });

    if (success) {
      showSuccess(`Saved config for ${monitor.name}`);
      if (onRefresh) {
        // Allow Niri's config watcher to process the file change before reloading outputs usually takes ~200ms, so we wait a bit longer to be safe.
        await new Promise((resolve) => setTimeout(resolve, 400));
        await onRefresh();
      }
      pop();
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save to Niri Config"
            onSubmit={saveConfig}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Monitor Name"
        text={`${monitor.make} ${monitor.model}`}
      />
      <Form.Description title="Port Name" text={monitor.name} />

      {canToggle && (
        <Form.Checkbox
          id="enabled"
          label="Monitor Enabled"
          defaultValue={isEnabled}
        />
      )}

      <>
        <Form.Dropdown
          id="mode"
          title="Resolution"
          defaultValue={currentResolution}
        >
          {monitor.modes.map((mode, index) => {
            const res = formatMode(mode);
            return (
              <Form.Dropdown.Item
                key={index}
                value={res}
                title={`${res}Hz${mode.is_preferred ? " (Preferred)" : ""}`}
              />
            );
          })}
        </Form.Dropdown>

        <Form.Dropdown
          id="scale"
          title="Scale"
          defaultValue={currentScale.toString()}
        >
          {COMMON_SCALES.map((scale, index) => (
            <Form.Dropdown.Item
              key={index}
              value={scale.toString()}
              title={`${scale}x`}
            />
          ))}
        </Form.Dropdown>

        <Form.Dropdown
          id="transform"
          title="Transform"
          defaultValue={currentTransform}
        >
          {TRANSFORMS.map((transform, index) => (
            <Form.Dropdown.Item
              key={index}
              value={transform.value}
              title={transform.label}
            />
          ))}
        </Form.Dropdown>
      </>
    </Form>
  );
}
