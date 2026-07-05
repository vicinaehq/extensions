import { Icon, List, getPreferenceValues, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { listPinnedTabs, type Entry, type Preferences } from "./lib";
import { EntryActions } from "./actions";

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
      {essentialTabs.map((e, i) => <List.Item key={`essential-${e.url}-${i}`} title={e.title} subtitle={e.subtitle} icon={Icon.Star} actions={<EntryActions entry={e} prefs={prefs} />} />)}
    </List.Section>
    <List.Section title="Pinned Tabs" subtitle={`${pinnedTabs.length}`}>
      {pinnedTabs.map((e, i) => <List.Item key={`pinned-${e.url}-${i}`} title={e.title} subtitle={e.subtitle} icon={Icon.Pin} actions={<EntryActions entry={e} prefs={prefs} />} />)}
    </List.Section>
    {items.length === 0 ? <List.EmptyView title="No Zen essential or pinned tabs found" description="Tabs are read safely from the selected Zen session backup." /> : null}
  </List>;
}
