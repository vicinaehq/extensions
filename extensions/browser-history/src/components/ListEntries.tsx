import { List } from "@raycast/api";
import { getFavicon } from "@raycast/utils";
import type { HistoryEntry } from "../interfaces";
import { HistoryItem } from "./index";

export { HistoryListEntry as HistoryEntry };

function HistoryListEntry({
  entry: { url, title, id, lastVisited, browser },
}: {
  entry: HistoryEntry;
}) {
  return (
    <List.Item
      id={id.toString()}
      title={title || ""}
      subtitle={url}
      icon={getFavicon(url)}
      actions={<HistoryItem entry={{ url, title, id, lastVisited, browser }} />}
    />
  );
}
