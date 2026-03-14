import {
  Action,
  ActionPanel,
  Form,
  Toast,
  showToast,
  useNavigation,
} from "@vicinae/api";
import { useState } from "react";
import { pactl } from "../pactl";
import { clamp } from "../ui/format";
import { showErrorToast } from "../ui/toasts";

type SetVolumeFormProps =
  | {
      kind: "sink" | "source";
      type: "stream";
      deviceTitle: string;
      deviceIndex: number;
      currentPercent?: number;
      onDone: () => Promise<void> | void;
    }
  | {
      kind: "sink" | "source";
      type: "device";
      deviceTitle: string;
      deviceName: string;
      currentPercent?: number;
      onDone: () => Promise<void> | void;
    };

const presets = [0, 10, 25, 50, 75, 100, 125, 150];

export function SetVolumeForm(props: SetVolumeFormProps) {
  const { kind, type, deviceTitle, currentPercent, onDone } = props;
  const { pop } = useNavigation();
  const [text, setText] = useState((currentPercent || 100).toString());

  async function apply(percent: number): Promise<void> {
    try {
      if (type === "stream") {
        await pactl.setStreamVolume(props.deviceIndex, percent, kind);
      } else {
        await pactl.setDeviceVolume(props.deviceName, percent, kind);
      }
      await showToast({
        style: Toast.Style.Success,
        title: "Volume updated",
        message: `${deviceTitle} → ${percent}%`,
      });
      await onDone();
      pop();
    } catch (e) {
      await showErrorToast({ title: "Failed to set volume", error: e });
    }
  }

  function parsePercent(s: string): number | undefined {
    const trimmed = s.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return undefined;
    return n;
  }

  async function submit(): Promise<void> {
    const parsed = parsePercent(text);
    if (parsed !== undefined) return apply(clamp(Math.round(parsed), 0, 150));
    await showToast({
      style: Toast.Style.Failure,
      title: "Invalid volume",
      message: "Enter a number between 0 and 150",
    });
  }

  return (
    <Form
      navigationTitle={`Set Volume · ${deviceTitle}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Apply" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="volume"
        title="Volume (%)"
        value={text}
        onChange={setText}
        info="0 - 150 (values above 100 amplify)"
      />
      <Form.Separator />
      <Form.Description text="Presets" />
      <Form.Dropdown
        id="preset"
        title="Pick a preset"
        defaultValue=""
        onChange={(v) => v && setText(v)}
      >
        <Form.Dropdown.Item title="—" value="" />
        {presets.map((p) => (
          <Form.Dropdown.Item key={p} title={`${p}%`} value={String(p)} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}
