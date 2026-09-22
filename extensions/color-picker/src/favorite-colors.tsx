import { Action, ActionPanel, Icon, List, showToast } from "@vicinae/api";
import { useHistory } from "./lib/history";
import { getAccessories, getFormattedColor, getIcon, getPreviewColor } from "./lib/utils";
import OrganizeColors from "./organize-colors";

function OpenOrganizeColorsAction() {
  return (
    <Action.Push
      icon={Icon.EyeDropper}
      title="Open Organize Colors"
      target={<OrganizeColors />}
    />
  );
}

export default function Command() {
  const { history, removeFromFavorites } = useHistory();
  const favorites = history?.filter((item) => item.isFavorite) ?? [];

  return (
    <List isLoading={history === undefined} searchBarPlaceholder="Search favorite colors">
      {history !== undefined && favorites.length === 0 ? (
        <List.EmptyView
          icon={Icon.Star}
          title="No favorite colors"
          description="Add colors to your favorites from Organize Colors."
          actions={
            <ActionPanel>
              <OpenOrganizeColorsAction />
            </ActionPanel>
          }
        />
      ) : (
        favorites.map((item) => {
          const formattedColor = getFormattedColor(item.color);
          const previewColor = getPreviewColor(item.color);

          return (
            <List.Item
              key={`${item.date}-${formattedColor}`}
              icon={getIcon(previewColor)}
              title={formattedColor}
              subtitle={item.title}
              accessories={getAccessories(item)}
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard content={formattedColor} />
                  <Action
                    icon={Icon.StarDisabled}
                    title="Remove from Favorites"
                    onAction={async () => {
                      removeFromFavorites(item.color);
                      await showToast({ title: "Removed from favorites" });
                    }}
                  />
                  <OpenOrganizeColorsAction />
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}
