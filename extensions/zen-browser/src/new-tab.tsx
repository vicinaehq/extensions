import { Action, ActionPanel, Icon, List, getPreferenceValues, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { normalizeUrlOrSearch, runZen, searchHistory, type Entry, type Preferences } from "./lib";
import { EntryActions } from "./actions";
export default function Command() {
  const prefs = getPreferenceValues<Preferences>(); const [query,setQuery]=useState(""); const [items,setItems]=useState<Entry[]>([]);
  useEffect(()=>{ try { setItems(searchHistory(query,prefs)); } catch { setItems([]); } },[query]);
  const open = async () => { const url=normalizeUrlOrSearch(query,prefs.searchEngine); runZen([url],prefs); await showToast({style:Toast.Style.Success,title:"Opening in Zen",message:url}); };
  return <List searchText={query} onSearchTextChange={setQuery} searchBarPlaceholder="Search or enter URL…" actions={<ActionPanel><Action title="Open in Zen" icon={Icon.Globe} onAction={open}/></ActionPanel>}>
    {query ? <List.Item title={`Open “${query}”`} subtitle={normalizeUrlOrSearch(query,prefs.searchEngine)} icon={Icon.Globe} actions={<ActionPanel><Action title="Open in Zen" icon={Icon.Globe} onAction={open}/></ActionPanel>} /> : null}
    <List.Section title="Recent History">{items.map((e,i)=><List.Item key={`${e.url}-${i}`} title={e.title} subtitle={e.subtitle} accessories={e.date?[{text:e.date}]:[]} icon={Icon.Clock} actions={<EntryActions entry={e} prefs={prefs}/>}/>)}</List.Section>
  </List>;
}
