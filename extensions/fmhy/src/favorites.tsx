import { List, Icon } from "@raycast/api";
import { useFMHYData } from "./hooks/useFMHYData";
import { useFavorites } from "./hooks/useFavorites";
import { useRecent } from "./hooks/useRecent";
import { LinkListItem } from "./components/LinkListItem";

export default function FavoritesCommand() {
  const { data, isLoading: isDataLoading } = useFMHYData();
  const { favorites, isLoading: isFavLoading, toggleFavorite } = useFavorites();
  const { addToRecent } = useRecent();

  const favoriteLinks = data?.allLinks.filter((link) => favorites.includes(link.id)) || [];

  return (
    <List isLoading={isDataLoading || isFavLoading} searchBarPlaceholder="Search favorites...">
      <List.Section title="Favorites" subtitle={`${favoriteLinks.length} items`}>
        {favoriteLinks.map((link, index) => (
          <LinkListItem
            key={`fav-${link.id}-${index}`}
            link={link}
            isFavorite={true}
            onToggleFavorite={() => toggleFavorite(link.id, link.title)}
            onVisit={addToRecent}
            showCategory
          />
        ))}
      </List.Section>
      {!isDataLoading && !isFavLoading && favoriteLinks.length === 0 && (
        <List.EmptyView
          icon={Icon.Star}
          title="No favorites yet"
          description="Mark links as favorites to see them here."
        />
      )}
    </List>
  );
}
