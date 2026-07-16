import { Action, ActionPanel, Clipboard, Icon, List, Toast, open, showToast, getPreferenceValues } from "@vicinae/api";
import { useEffect, useState } from "react";
import { BrewItem, Preferences, getInfo, terminalCommand } from "./lib";
import { spawnInTerminal } from "./terminal";

export function PackageList({ title, load }: { title: string; load: (prefs: Preferences) => Promise<BrewItem[]> }) {
  const prefs = getPreferenceValues<Preferences>();
  const [items, setItems] = useState<BrewItem[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  async function refresh() {
    setLoading(true); setError(undefined);
    try { setItems(await load(prefs)); } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);
  return <List isLoading={loading} searchBarPlaceholder={title}>
    {error ? <List.EmptyView title="Linuxbrew command failed" description={error} /> : items.map((item) => <PackageItem key={`${item.kind}:${item.name}`} item={item} prefs={prefs} onRefresh={refresh} />)}
    {!error && !loading && items.length === 0 ? <List.EmptyView title="No packages found" /> : null}
  </List>;
}

export function PackageItem({ item, prefs, onRefresh }: { item: BrewItem; prefs: Preferences; onRefresh?: () => void }) {
  const subtitle = [item.kind !== "unknown" ? item.kind : undefined, item.version, item.desc].filter(Boolean).join(" · ");
  return <List.Item title={item.name} subtitle={subtitle} icon="extension-icon.png" accessories={[item.installed ? { text: "Installed" } : item.outdated ? { text: "Outdated" } : {}]} actions={<ActionPanel>
    <Action title="Show Info" icon={Icon.Info01} onAction={async () => {
      try { const info = await getInfo(item.fullName || item.name, prefs); await showToast({ style: Toast.Style.Success, title: info?.name || item.name, message: info?.desc || "Loaded package info" }); }
      catch (e: any) { await showToast({ style: Toast.Style.Failure, title: "brew info failed", message: e?.message || String(e) }); }
    }} />
    <Action title="Install in Terminal" icon={Icon.Download} onAction={() => runTerminalAction(["install", item.fullName || item.name], prefs)} />
    <Action title="Upgrade in Terminal" icon={Icon.ArrowClockwise} onAction={() => runTerminalAction(["upgrade", item.fullName || item.name], prefs)} />
    <Action title="Uninstall in Terminal" icon={Icon.Trash} onAction={() => runTerminalAction(["uninstall", item.fullName || item.name], prefs)} />
    {item.homepage ? <Action title="Open Homepage" icon={Icon.Globe01} onAction={() => open(item.homepage!)} /> : null}
    <Action title="Copy Install Command" icon={Icon.CopyClipboard} onAction={async () => { const cmd = terminalCommand(["install", item.fullName || item.name], prefs); await Clipboard.copy(cmd); await showToast({ style: Toast.Style.Success, title: "Copied", message: cmd }); }} />
    {onRefresh ? <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={onRefresh} /> : null}
  </ActionPanel>} />;
}

async function runTerminalAction(args: string[], prefs: Preferences): Promise<void> {
  try {
    await spawnInTerminal(args, prefs);
  } catch (e: any) {
    await showToast({ style: Toast.Style.Failure, title: "Could not open terminal", message: e?.message || String(e) });
  }
}
