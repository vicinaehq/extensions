import { List, ActionPanel, Action, Icon, Color, open } from "@raycast/api";
import { LinkDetail } from "./LinkDetail";
import type { FMHYLink } from "../types";

interface LinkListItemProps {
  link: FMHYLink;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onVisit?: (id: string) => void;
  showCategory?: boolean;
}

export function LinkListItem({ link, isFavorite, onToggleFavorite, onVisit, showCategory = false }: LinkListItemProps) {
  // Truncate description for subtitle
  const subtitle = link.description.length > 80 ? link.description.substring(0, 77) + "..." : link.description;

  const accessories: List.Item.Accessory[] = [];

  if (showCategory) {
    accessories.push({ tag: link.category, icon: link.icon });
    accessories.push({ text: link.subcategory });
  } else if (link.subSubcategory) {
    accessories.push({ tag: link.subSubcategory });
  }

  if (isFavorite) {
    accessories.unshift({ icon: { source: Icon.Star, tintColor: Color.Yellow }, tooltip: "Favorited" });
  }

  const handleOpen = async () => {
    onVisit?.(link.id);
    await open(link.url);
  };

  return (
    <List.Item
      icon={link.isStarred ? "⭐" : Icon.Link}
      title={link.title}
      subtitle={subtitle}
      accessories={accessories}
      actions={
        <ActionPanel>
          <Action.Push
            title="View Details"
            icon={Icon.Eye}
            target={
              <LinkDetail link={link} isFavorite={isFavorite} onToggleFavorite={onToggleFavorite} onVisit={onVisit} />
            }
          />
          <Action title="Open Link" icon={Icon.Globe} onAction={handleOpen} />
          <Action
            title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
            icon={isFavorite ? Icon.StarDisabled : Icon.Star}
            shortcut={{ modifiers: ["cmd"], key: "d" }}
            onAction={onToggleFavorite}
          />
          <Action.CopyToClipboard title="Copy URL" content={link.url} shortcut={{ modifiers: ["cmd"], key: "c" }} />
          <Action.OpenInBrowser
            title="Open on FMHY Website"
            url={link.fmhyUrl}
            icon={Icon.Book}
            shortcut={{ modifiers: ["cmd"], key: "o" }}
          />
          <Action.CopyToClipboard
            title="Copy Markdown Link"
            content={`[${link.title}](${link.url})`}
            shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
          />
        </ActionPanel>
      }
    />
  );
}
