import { Action, ActionPanel, Icon, showToast, Toast } from "@vicinae/api";
import { runZen, type Entry, type Preferences } from "./lib";

export function EntryActions({ entry, prefs }: { entry: Entry; prefs: Preferences }) {
  return <ActionPanel>
    <Action title="Open in Zen" icon={Icon.Globe01} onAction={async () => { runZen([entry.url], prefs); await showToast({ style: Toast.Style.Success, title: "Opening in Zen", message: entry.url }); }} />
    <Action.OpenInBrowser title="Open in Default Browser" url={entry.url} />
    <Action.CopyToClipboard title="Copy URL" content={entry.url} />
  </ActionPanel>;
}
