import { Action, ActionPanel, Icon, List, Toast, getPreferenceValues, showToast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { PackageItem } from "./components";
import { BrewItem, Preferences, listOutdatedAsync, upgradeArgs } from "./lib";
import { spawnInTerminal } from "./terminal";

export default function Command() {
  const prefs = getPreferenceValues<Preferences>();
  const [items, setItems] = useState<BrewItem[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  async function refresh() {
    setLoading(true); setError(undefined);
    try { setItems(await listOutdatedAsync(prefs)); } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);
  return <List isLoading={loading} searchBarPlaceholder="Upgrade Linuxbrew packages">
    {error ? <List.EmptyView title="brew outdated failed" description={error} /> : null}
    {!error ? <List.Section title="Actions"><List.Item title="Upgrade All Outdated Packages" icon="extension-icon.png" accessories={[{ text: `${items.length} outdated` }]} actions={<ActionPanel><Action title="Upgrade All in Terminal" icon={Icon.ArrowClockwise} onAction={async () => {
        try { await spawnInTerminal(upgradeArgs(undefined, prefs), prefs); }
        catch (e: any) { await showToast({ style: Toast.Style.Failure, title: "Could not open terminal", message: e?.message || String(e) }); }
      }} /><Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refresh} /></ActionPanel>} /></List.Section> : null}
    {!error ? <List.Section title="Outdated Packages">{items.map((item) => <PackageItem key={`${item.kind}:${item.name}`} item={item} prefs={prefs} onRefresh={refresh} />)}</List.Section> : null}
  </List>;
}
