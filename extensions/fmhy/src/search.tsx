/**
 * Search FMHY Command
 * Allows global search across all links in the FMHY database
 */

import { useState, useMemo } from "react";
import { List, Icon, Color } from "@raycast/api";
import { useFMHYData } from "./hooks/useFMHYData";
import { useFavorites } from "./hooks/useFavorites";
import { useRecent } from "./hooks/useRecent";
import { searchLinks } from "./utils/search";
import { LinkListItem } from "./components/LinkListItem";


export default function SearchCommand() {
  const { data, isLoading, error } = useFMHYData();
  const { toggleFavorite, isFavorite } = useFavorites();
  const { addToRecent } = useRecent();
  const [searchText, setSearchText] = useState("");

  // Filter and rank links based on search text
  const filteredLinks = useMemo(() => {
    if (!data) return [];
    if (!searchText.trim()) return data.allLinks.slice(0, 100); // Show some initially
    return searchLinks(searchText, data.allLinks);
  }, [data, searchText]);

  if (error) {
    return (
      <List>
        <List.EmptyView
          icon={{ source: Icon.ExclamationMark, tintColor: Color.Red }}
          title="Failed to load FMHY data"
          description={error.message}
        />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search all FMHY links (e.g., 'streaming movies')..."
      throttle
    >
      <List.Section title="Results" subtitle={`${filteredLinks.length} links`}>
        {filteredLinks.map((link, index) => (
          <LinkListItem
            key={`search-${link.id}-${index}`}
            link={link}
            isFavorite={isFavorite(link.id)}
            onToggleFavorite={() => toggleFavorite(link.id, link.title)}
            onVisit={addToRecent}
            showCategory
          />
        ))}
      </List.Section>
    </List>
  );
}
