/**
 * Browse FMHY Command
 * Main command to browse categories and links
 */

import { ActionPanel, Action, List, Icon, Color } from "@raycast/api";
import { useState, useMemo } from "react";
import { useFMHYData } from "./hooks/useFMHYData";
import { useFavorites } from "./hooks/useFavorites";
import { useRecent } from "./hooks/useRecent";
import { searchLinks } from "./utils/search";
import { LinkDetail } from "./components/LinkDetail";
import { LinkListItem } from "./components/LinkListItem";
import type { FMHYCategory, FMHYLink } from "./types";

export default function BrowseCommand() {
  const { data, isLoading, error } = useFMHYData();
  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  const { addToRecent } = useRecent();

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
    <List isLoading={isLoading} searchBarPlaceholder="Search categories...">
      {data?.categories.map((category) => (
        <List.Item
          key={category.slug}
          icon={category.icon}
          title={category.name}
          subtitle={`${category.linkCount} links`}
          accessories={[
            category.starredCount > 0 ? { tag: { value: `${category.starredCount} ⭐`, color: Color.Yellow } } : {},
          ]}
          actions={
            <ActionPanel>
              <Action.Push
                title="Browse Category"
                icon={Icon.ArrowRight}
                target={
                  <CategoryDetailView
                    category={category}
                    isFavorite={isFavorite}
                    onToggleFavorite={toggleFavorite}
                    onVisit={addToRecent}
                  />
                }
              />
              <Action.OpenInBrowser
                title="Open on FMHY Website"
                url={`https://fmhy.net/${category.slug}`}
                shortcut={{ modifiers: ["cmd"], key: "o" }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

/**
 * Category detail view showing subcategories and links
 */
function CategoryDetailView({
  category,
  isFavorite,
  onToggleFavorite,
  onVisit,
}: {
  category: FMHYCategory;
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (id: string, title?: string) => void;
  onVisit: (id: string) => void;
}) {
  const [searchText, setSearchText] = useState("");

  // Flatten all links for searching - deduplicate by ID
  const allCategoryLinks = useMemo(() => {
    const seen = new Set<string>();
    const links: FMHYLink[] = [];
    for (const sub of category.subcategories) {
      for (const link of sub.links) {
        if (!seen.has(link.id)) {
          seen.add(link.id);
          links.push(link);
        }
      }
    }
    return links;
  }, [category]);

  // Filter links based on search text
  const filteredLinks = useMemo(() => {
    if (!searchText.trim()) return null; // Use original structure when not searching
    return searchLinks(searchText, allCategoryLinks);
  }, [searchText, allCategoryLinks]);

  // Deduplicated starred links
  const starredLinks = useMemo(() => {
    const seen = new Set<string>();
    return allCategoryLinks.filter((l) => {
      if (l.isStarred && !seen.has(l.id)) {
        seen.add(l.id);
        return true;
      }
      return false;
    });
  }, [allCategoryLinks]);

  // Helper to render links with a key prefix for uniqueness
  const renderLinks = (links: FMHYLink[], keyPrefix: string) => {
    return links.map((link, index) => (
      <LinkListItem
        key={`${keyPrefix}-${link.id}-${index}`}
        link={link}
        isFavorite={isFavorite(link.id)}
        onToggleFavorite={() => onToggleFavorite(link.id, link.title)}
        onVisit={onVisit}
      />
    ));
  };

  return (
    <List
      navigationTitle={`${category.icon} ${category.name}`}
      searchBarPlaceholder={`Search in ${category.name}...`}
      onSearchTextChange={setSearchText}
      throttle
    >
      {filteredLinks ? (
        // Search results view (flat list)
        <List.Section title="Results" subtitle={`${filteredLinks.length} items`}>
          {renderLinks(filteredLinks, "search")}
        </List.Section>
      ) : (
        // Normal category view (grouped by subcategory)
        <>
          {/* Starred section */}
          {starredLinks.length > 0 && (
            <List.Section title="⭐ Recommended">{renderLinks(starredLinks, "starred")}</List.Section>
          )}

          {/* Subcategory sections */}
          {category.subcategories.map((subcategory) => {
            const regularLinks = subcategory.links.filter((link) => !link.isStarred);
            if (regularLinks.length === 0) return null;

            return (
              <List.Section key={subcategory.anchor} title={subcategory.name} subtitle={`${regularLinks.length} links`}>
                {renderLinks(regularLinks, subcategory.anchor)}
              </List.Section>
            );
          })}
        </>
      )}
    </List>
  );
}
