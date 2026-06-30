import { Action, ActionPanel, Detail, Form, Icon, getPreferenceValues, showToast, Toast, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";
import { existingConfigPath, ghosttyBin, readConfig, validateGhosttyConfig, writeConfig, type Preferences } from "./lib";

function EditConfig({ initial, onSaved }: { initial: string; onSaved: () => void }) {
  const { pop } = useNavigation();
  async function submit(v: { config: string }) {
    writeConfig(v.config);
    await showToast({ style: Toast.Style.Success, title: "Saved Ghostty config", message: existingConfigPath() });
    onSaved();
    pop();
  }
  return <Form navigationTitle="Edit Ghostty Config" actions={<ActionPanel><Action.SubmitForm title="Save Config" onSubmit={submit} /></ActionPanel>}>
    <Form.TextArea id="config" title="Config" defaultValue={initial} />
  </Form>;
}

export default function Command() {
  const [text, setText] = useState("");
  const prefs = getPreferenceValues<Preferences>();
  const reload = () => setText(readConfig());
  useEffect(reload, []);
  const md = `# Ghostty Config\n\n\`${existingConfigPath()}\`\n\n\`\`\`ini\n${text.replace(/`/g, "\\`")}\n\`\`\``;
  return <Detail markdown={md} actions={<ActionPanel>
    <Action.Push title="Edit Config" icon={Icon.Pencil} target={<EditConfig initial={text} onSaved={reload} />} />
    <Action title="Validate Config" icon={Icon.CheckCircle} onAction={async () => {
      const result = validateGhosttyConfig(ghosttyBin(prefs));
      await showToast({ style: result.ok ? Toast.Style.Success : Toast.Style.Failure, title: result.ok ? "Ghostty config is valid" : "Ghostty config is invalid", message: result.message.slice(0, 160) });
    }} />
    <Action.Open title="Open Config File" target={existingConfigPath()} />
  </ActionPanel>} />;
}
