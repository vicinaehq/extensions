import { List, getPreferenceValues } from "@vicinae/api";
import { useEffect, useState } from "react";
import { PackageItem } from "./components";
import { BrewItem, Preferences, searchPackagesAsync } from "./lib";

export default function Command(props: { arguments?: { search?: string }; fallbackText?: string }) {
  const prefs = getPreferenceValues<Preferences>();
  const initial = props.arguments?.search || props.fallbackText || "";
  const [query, setQuery] = useState(initial);
  const [items, setItems] = useState<BrewItem[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const q = query.trim();
    let cancelled = false;
    if (!q) { setItems([]); setError(undefined); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try { const results = await searchPackagesAsync(q, prefs); if (!cancelled) { setItems(results); setError(undefined); } }
      catch (e: any) { if (!cancelled) { setError(e?.message || String(e)); setItems([]); } }
      finally { if (!cancelled) setLoading(false); }
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, prefs.includeCasks, prefs.customBrewPath]);
  return <List isLoading={loading} searchText={query} onSearchTextChange={setQuery} searchBarPlaceholder="Search Linuxbrew formulae and casks…">
    {error ? <List.EmptyView title="Search failed" description={error} /> : items.map((item) => <PackageItem key={`${item.fullName}:${item.name}`} item={item} prefs={prefs} />)}
    {!error && query.trim() === "" ? <List.EmptyView title="Search Linuxbrew" description="Type a package name, formula, or cask." icon="extension-icon.png" /> : null}
    {!error && query.trim() !== "" && !loading && items.length === 0 ? <List.EmptyView title="No packages found" /> : null}
  </List>;
}
