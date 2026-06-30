import { Icon, List, getPreferenceValues, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { searchBookmarks, type Entry, type Preferences } from "./lib";
import { EntryActions } from "./actions";
export default function Command() { const prefs=getPreferenceValues<Preferences>(); const [q,setQ]=useState(""); const [items,setItems]=useState<Entry[]>([]); const [loading,setLoading]=useState(false); useEffect(()=>{ setLoading(true); try{setItems(searchBookmarks(q,prefs));}catch(e:any){showToast({style:Toast.Style.Failure,title:"Could not search bookmarks",message:e?.message||String(e)});setItems([]);} finally{setLoading(false);} },[q]); return <List isLoading={loading} searchText={q} onSearchTextChange={setQ} searchBarPlaceholder="Search Zen bookmarks…">{items.map((e,i)=><List.Item key={`${e.url}-${i}`} title={e.title} subtitle={e.subtitle} icon={Icon.Bookmark} actions={<EntryActions entry={e} prefs={prefs}/>}/>)}</List>; }
