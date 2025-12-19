import { List, Icon, ActionPanel, Action } from "@raycast/api";
import { useFMHYData } from "./hooks/useFMHYData";
import { useFavorites } from "./hooks/useFavorites";
import { useRecent } from "./hooks/useRecent";
import { LinkListItem } from "./components/LinkListItem";

export default function RecentCommand() {
  const { data, isLoading: isDataLoading } = useFMHYData();
  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  const { recentIds, isLoading: isRecentLoading, addToRecent, clearRecent } = useRecent();

  // Map IDs to links and preserve order
  const recentLinks = recentIds
    .map((id) => data?.allLinks.find((link) => link.id === id))
    .filter((link): link is NonNullable<typeof link> => !!link);

  const isLoading = isDataLoading || isRecentLoading;

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search recent history...">
      <List.Section title="Recently Viewed" subtitle={`${recentLinks.length} items`}>
        {recentLinks.map((link, index) => (
          <LinkListItem
            key={`recent-${link.id}-${index}`}
            link={link}
            isFavorite={isFavorite(link.id)}
            onToggleFavorite={() => toggleFavorite(link.id, link.title)}
            onVisit={addToRecent}
            showCategory
          />
        ))}
      </List.Section>

      {!isLoading && recentLinks.length === 0 && (
        <List.EmptyView icon={Icon.Clock} title="No history" description="Links you open will appear here." />
      )}

      {!isLoading && recentLinks.length > 0 && (
        <List.Section title="Actions">
          <List.Item
            title="Clear History"
            icon={Icon.Trash}
            actions={
              <ActionPanel>
                <Action title="Clear History" onAction={clearRecent} style={Action.Style.Destructive} />
              </ActionPanel>
            }
          />
        </List.Section>
      )}
    </List>
  );
}
