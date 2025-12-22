import { Action, ActionPanel, Form, Toast, showToast, useNavigation } from "@vicinae/api";
import { useState } from "react";
import { pactl } from "../pactl";
import { clamp } from "../ui/format";
import { showErrorToast } from "../ui/toasts";

export function SetVolumeForm(props: {
  kind: "sink" | "source";
  deviceName: string;
  deviceTitle: string;
  currentPercent?: number;
  onDone: () => Promise<void> | void;
}) {
  const { kind, deviceName, deviceTitle, currentPercent, onDone } = props;
  const { pop } = useNavigation();
  const presets = [0, 10, 25, 50, 75, 100, 125, 150];
  const [text, setText] = useState(String(typeof currentPercent === "number" ? currentPercent : 100));

  async function apply(percent: number): Promise<void> {
    const safe = clamp(Math.round(percent), 0, 150);
    try {
      if (kind === "sink") await pactl.setSinkVolume(deviceName, safe);
      else await pactl.setSourceVolume(deviceName, safe);
      await showToast({ style: Toast.Style.Success, title: "Volume updated", message: `${deviceTitle} → ${safe}%` });
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

  async function submit(input: Form.Values): Promise<void> {
    const raw = input.volume;
    const val = typeof raw === "string" ? raw : "";
    const parsed = parsePercent(val);
    if (parsed === undefined) {
      await showToast({ style: Toast.Style.Failure, title: "Invalid volume", message: "Enter a number between 0 and 150" });
      return;
    }
    await apply(clamp(parsed, 0, 150));
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
      <Form.Dropdown id="preset" title="Pick a preset" defaultValue="" onChange={(v) => v && setText(v)}>
        <Form.Dropdown.Item title="—" value="" />
        {presets.map((p) => (
          <Form.Dropdown.Item key={p} title={`${p}%`} value={String(p)} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}


