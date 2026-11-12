import { Action, ActionPanel, Form, confirmAlert, environment, openExtensionPreferences } from "@vicinae/api";
import { useRef, useState } from "react";
import { aliasSetupError, aliasTarget, applyAliasSetup, defaultAliasConfigPath, planAliasSetup } from "./lib/alias-setup";
import { expandPath } from "./lib/paths";

/** Nothing reads or writes the config until the user submits and confirms setup. */
export default function AliasSetup() {
  const [file, setFile] = useState(defaultAliasConfigPath);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();
  const pending = useRef(false);
  async function setup() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setStatus(undefined);
    try {
      const target = aliasTarget(environment.ownerOrAuthorName, environment.assetsPath);
      const configPath = expandPath(file);
      if (!await confirmAlert({
        title: "Set up the ! alias for Bang?",
        message: `Update only Bang's command alias in:\n${configPath}\n\nA private backup of the entire file will be created beside it before changing anything. Backups may contain credentials; keep them private. Existing aliases will not be replaced. Use the correct file if Vicinae was started with --config. This enables ! then Space, not live !query routing.`,
        primaryAction: { title: "Back Up and Set Alias" },
      })) return;
      const plan = await planAliasSetup(configPath, target);
      const result = await applyAliasSetup(plan);
      setStatus(result.changed
        ? `Alias written. Vicinae normally reloads settings automatically. Type ! followed by Space in root search.\nBackup: ${result.backupPath}`
        : "Bang already has the ! alias. No file was changed and no backup was needed. Type ! followed by Space in root search.");
    } catch (error) {
      setStatus(aliasSetupError(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return <Form navigationTitle="Set Up ! Alias" enableDrafts={false} isLoading={busy} actions={<ActionPanel>
    <Action title="Set Up ! Alias…" onAction={setup} />
    <Action title="Open Manual Preferences" onAction={() => openExtensionPreferences()} />
  </ActionPanel>}>
    <Form.Description title="Optional setup" text="The SDK has no alias setter, so this action edits Vicinae's settings file with a private backup. Only Bang's alias is changed. Setup refuses existing alias conflicts, a different Bang alias, imported/overridden configurations, and linked files. It never runs a shell command or changes a global shortcut. Do not edit Vicinae settings concurrently." />
    <Form.TextField id="configPath" title="Active Vicinae Settings File" value={file} onChange={setFile} storeValue={false} info="Defaults to XDG_CONFIG_HOME/vicinae/settings.json. If you use --config, select that file instead. Imports, overrides or symlink-managed configs require manual setup." />
    <Form.Description title="Alias behavior" text="Type ! then Space to enter Bang. Typing !docker without Space is not supported. You can change or remove the alias later in Vicinae Settings." />
    {status && <Form.Description title="Setup Result" text={status} />}
  </Form>;
}
