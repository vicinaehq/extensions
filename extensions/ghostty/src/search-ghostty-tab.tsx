import { Action, ActionPanel, Icon, List, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { focusWindow, listGhosttyWindows } from "./lib";

export default function Command() {
  const [items, setItems] = useState<{ id: string; title: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const refresh = async () => {
    setIsLoading(true);
    try { setItems(listGhosttyWindows()); }
    catch (e: any) { setItems([]); await showToast({ style: Toast.Style.Failure, title: "Could not list Ghostty windows", message: "Install wmctrl or use a desktop that exposes windows to wmctrl." }); }
    finally { setIsLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  return <List isLoading={isLoading} searchBarPlaceholder="Search Ghostty windows…">
    {items.map((w) => <List.Item key={w.id} title={w.title} subtitle={w.id} icon={Icon.Terminal} actions={<ActionPanel>
      <Action title="Focus Window" icon={Icon.ArrowRightCircle} onAction={async () => {
        try { focusWindow(w.id); await showToast({ style: Toast.Style.Success, title: "Focused Ghostty", message: w.title }); }
        catch (e: any) { await showToast({ style: Toast.Style.Failure, title: "Could not focus window", message: e?.message || String(e) }); }
      }} />
      <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refresh} />
    </ActionPanel>} />)}
    {!isLoading && items.length === 0 ? <List.EmptyView title="No Ghostty windows found" description="This command uses wmctrl. On Wayland, some compositors may not expose native windows." /> : null}
  </List>;
}
