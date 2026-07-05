import { Action, ActionPanel, Icon, List, getPreferenceValues, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { focusZenTab, listPinnedTabs, runZen, type Entry, type Preferences } from "./lib";

function PinnedTabActions({ entry, prefs }: { entry: Entry; prefs: Preferences }) {
  return <ActionPanel>
    <Action title="Focus Existing Zen Tab" icon={Icon.ArrowRightCircle} onAction={async () => { try { focusZenTab(entry.tabIndex || 0); await showToast({ style: Toast.Style.Success, title: "Focused Zen tab", message: entry.title }); } catch (e: any) { await showToast({ style: Toast.Style.Failure, title: "Could not focus Zen tab", message: e?.message || String(e) }); } }} />
    <Action title="Open URL in New Zen Tab" icon={Icon.Globe01} onAction={async () => { runZen([entry.url], prefs); await showToast({ style: Toast.Style.Success, title: "Opening in Zen", message: entry.url }); }} />
    <Action.OpenInBrowser title="Open in Default Browser" url={entry.url} />
    <Action.CopyToClipboard title="Copy URL" content={entry.url} />
  </ActionPanel>;
}

export default function Command() {
  const prefs = getPreferenceValues<Preferences>();
  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    try {
      setItems(listPinnedTabs(prefs));
    } catch (e: any) {
      showToast({ style: Toast.Style.Failure, title: "Could not list pinned tabs", message: e?.message || String(e) });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const essentialTabs = items.filter((e) => e.essential);
  const pinnedTabs = items.filter((e) => !e.essential);

  return <List isLoading={loading} searchBarPlaceholder="Search Zen essential and pinned tabs…">
    <List.Section title="Essential Tabs" subtitle={`${essentialTabs.length}`}>
      {essentialTabs.map((e, i) => <List.Item key={`essential-${e.url}-${i}`} title={e.title} subtitle={e.subtitle} accessories={e.tabIndex ? [{ text: `Tab ${e.tabIndex}` }] : []} icon={Icon.Star} actions={<PinnedTabActions entry={e} prefs={prefs} />} />)}
    </List.Section>
    <List.Section title="Pinned Tabs" subtitle={`${pinnedTabs.length}`}>
      {pinnedTabs.map((e, i) => <List.Item key={`pinned-${e.url}-${i}`} title={e.title} subtitle={e.subtitle} accessories={e.tabIndex ? [{ text: `Tab ${e.tabIndex}` }] : []} icon={Icon.Pin} actions={<PinnedTabActions entry={e} prefs={prefs} />} />)}
    </List.Section>
    {items.length === 0 ? <List.EmptyView title="No Zen essential or pinned tabs found" description="Tabs are read safely from the selected Zen session backup." /> : null}
  </List>;
}
