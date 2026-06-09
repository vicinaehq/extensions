import { Action, ActionPanel, Icon, List, getPreferenceValues, showToast, Toast } from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";
import { basename } from "path";
import { defaultWorkspaceRoot, findGitRepos, ghosttyBin, listLaunchConfigs, openGhosttyWindow, runLaunchConfig, type Preferences } from "./lib";

export default function Command() {
  const prefs = getPreferenceValues<Preferences>();
  const [repos, setRepos] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const configs = useMemo(() => listLaunchConfigs(), []);
  const validConfigs = configs.filter((c) => !c.error && c.config);

  const refresh = async () => {
    setIsLoading(true);
    try { setRepos(findGitRepos(defaultWorkspaceRoot(prefs), Number(prefs.workspaceScanDepth || 3))); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  return <List isLoading={isLoading} searchBarPlaceholder="Search git repositories…">
    {repos.map((repo) => <List.Item key={repo} title={basename(repo)} subtitle={repo} icon={Icon.Folder} actions={<ActionPanel>
      <Action title="Open in Ghostty" icon={Icon.Terminal} onAction={async () => {
        try { openGhosttyWindow(repo, ghosttyBin(prefs)); await showToast({ style: Toast.Style.Success, title: "Opened workspace", message: repo }); }
        catch (e: any) { await showToast({ style: Toast.Style.Failure, title: "Could not open workspace", message: e?.message || String(e) }); }
      }} />
      {validConfigs.map((c) => <Action key={c.path} title={`Open with ${c.name}`} icon={Icon.Play} onAction={async () => {
        try { runLaunchConfig(c.config!, ghosttyBin(prefs), repo); await showToast({ style: Toast.Style.Success, title: `Opened ${basename(repo)}`, message: c.name }); }
        catch (e: any) { await showToast({ style: Toast.Style.Failure, title: "Could not run launch config", message: e?.message || String(e) }); }
      }} />)}
      <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refresh} />
    </ActionPanel>} />)}
    {!isLoading && repos.length === 0 ? <List.EmptyView title="No Git repositories found" description={`Scanned ${defaultWorkspaceRoot(prefs)}. Change the Workspaces Parent Directory preference if needed.`} /> : null}
  </List>;
}
