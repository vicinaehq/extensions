import { Action, ActionPanel, Form, Icon, List, getPreferenceValues, showToast, Toast, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";
import { ghosttyBin, listLaunchConfigs, runLaunchConfig, saveLaunchConfig, launchConfigDir, type LaunchConfigEntry, type Preferences } from "./lib";

function AddConfig({ onSaved }: { onSaved: () => void }) {
  const { pop } = useNavigation();
  async function submit(values: { name: string; yaml: string }) {
    try { const path = saveLaunchConfig(values.name, values.yaml); await showToast({ style: Toast.Style.Success, title: "Saved launch config", message: path }); onSaved(); pop(); }
    catch (e: any) { await showToast({ style: Toast.Style.Failure, title: "Invalid launch config", message: e?.message || String(e) }); }
  }
  const sample = `name: dev\nwindows:\n  - tabs:\n      - title: Shell\n        cwd: ~/\n        commands:\n          - pwd\n`;
  return <Form navigationTitle="Add Launch Configuration" actions={<ActionPanel><Action.SubmitForm title="Save Configuration" onSubmit={submit} /></ActionPanel>}>
    <Form.TextField id="name" title="Name" defaultValue="dev" />
    <Form.TextArea id="yaml" title="YAML" defaultValue={sample} />
  </Form>;
}

export default function Command() {
  const [configs, setConfigs] = useState<LaunchConfigEntry[]>([]);
  const prefs = getPreferenceValues<Preferences>();
  const refresh = () => setConfigs(listLaunchConfigs());
  useEffect(refresh, []);
  return <List searchBarPlaceholder="Search launch configurations…">
    <List.Section title="Configurations" subtitle={launchConfigDir}>{configs.map((c) => <List.Item key={c.path} title={c.name} subtitle={c.error ? `Invalid: ${c.error}` : c.path} icon={c.error ? Icon.Warning : Icon.Terminal} actions={<ActionPanel>
      {!c.error && c.config ? <Action title="Open Configuration" icon={Icon.Play} onAction={async () => {
        try { runLaunchConfig(c.config, ghosttyBin(prefs)); await showToast({ style: Toast.Style.Success, title: "Opened launch configuration", message: c.name }); }
        catch (e: any) { await showToast({ style: Toast.Style.Failure, title: "Could not run launch config", message: e?.message || String(e) }); }
      }} /> : null}
      <Action.Push title="Add Configuration" icon={Icon.Plus} target={<AddConfig onSaved={refresh} />} />
    </ActionPanel>} />)}</List.Section>
    {configs.length === 0 ? <List.EmptyView title="No launch configurations" description={`Add one now. Stored in ${launchConfigDir}`} actions={<ActionPanel><Action.Push title="Add Configuration" icon={Icon.Plus} target={<AddConfig onSaved={refresh} />} /></ActionPanel>} /> : null}
  </List>;
}
