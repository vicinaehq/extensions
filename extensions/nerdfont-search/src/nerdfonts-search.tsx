import {
  Action,
  ActionPanel,
  Color,
  Grid,
  Icon,
  showHUD,
  type Image,
} from "@vicinae/api";
import { useMemo, useState } from "react";
import { MIN_SEARCH_LENGTH, PACK_FILTER_ALL } from "./constants";
import { type IconEntry, useIconSearch } from "./hooks/useIconSearch";
import { useRecentIcons } from "./hooks/useRecentIcons";
import searchConfig from "./search-config.json";

const PACK_LABELS = searchConfig.packLabels as Record<string, string>;

function createThemedIcon(source: string): Image {
  return {
    source,
    tintColor: Color.PrimaryText,
  };
}

type CopyType =
  | "glyph"
  | "Nerd Font name"
  | "identifier"
  | "Unicode codepoint"
  | "HTML entity";

function IconActions({
  icon,
  onCopy,
  onClearRecent,
}: {
  icon: IconEntry;
  onCopy: (copyType: CopyType) => void;
  onClearRecent?: () => void;
}) {
  return (
    <ActionPanel>
      <ActionPanel.Section>
        <Action.CopyToClipboard
          title="Copy glyph"
          content={icon.char}
          icon={Icon.CopyClipboard}
          onCopy={() => onCopy("glyph")}
          shortcut={{ modifiers: ["cmd"], key: "c" }}
        />
        <Action.CopyToClipboard
          title="Copy Nerd Font name"
          content={icon.nerdFontId}
          icon={Icon.Hashtag}
          onCopy={() => onCopy("Nerd Font name")}
          shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
        />
        <Action.CopyToClipboard
          title="Copy identifier"
          content={icon.id}
          icon={Icon.BlankDocument}
          onCopy={() => onCopy("identifier")}
        />
        <Action.CopyToClipboard
          title="Copy Unicode codepoint"
          content={icon.hexCode}
          icon={Icon.Terminal}
          onCopy={() => onCopy("Unicode codepoint")}
        />
        <Action.CopyToClipboard
          title="Copy HTML entity"
          content={icon.htmlEntity}
          icon={Icon.Globe01}
          onCopy={() => onCopy("HTML entity")}
        />
      </ActionPanel.Section>
      {onClearRecent && (
        <ActionPanel.Section title="Recent Icons">
          <Action
            title="Clear Recently Copied Icons"
            icon={Icon.Trash}
            shortcut={{ modifiers: ["cmd", "shift"], key: "delete" }}
            onAction={onClearRecent}
          />
        </ActionPanel.Section>
      )}
    </ActionPanel>
  );
}

export default function NerdFontSearch() {
  const [searchText, setSearchText] = useState("");
  const [selectedPack, setSelectedPack] = useState(PACK_FILTER_ALL);
  // Use custom hooks for data management
  const { recentIcons, addRecent, clearRecent } = useRecentIcons();
  const { icons: searchResults, isLoading } = useIconSearch(
    searchText,
    selectedPack,
  );

  const displayIcons = useMemo(() => {
    if (searchText.length === 0 && selectedPack === PACK_FILTER_ALL) {
      return recentIcons.map((icon) => ({
        ...icon,
        keywords: [],
        markdown: "",
      }));
    }
    if (searchText.length < MIN_SEARCH_LENGTH && selectedPack === PACK_FILTER_ALL) {
      return [];
    }
    return searchResults;
  }, [searchText, selectedPack, recentIcons, searchResults]);

  // Pack filter options
  const packFilterOptions = useMemo<{ value: string; label: string }[]>(() => {
    return Object.entries(PACK_LABELS)
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, []);

  const handleCopyIcon = async (icon: IconEntry, copyType: CopyType) => {
    addRecent(icon);
    await showHUD(`Copied ${copyType}: ${icon.displayName}`);
  };

  return (
    <Grid
      columns={8}
      fit={Grid.Fit.Contain}
      aspectRatio="1"
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search NerdFont Icons"
      searchBarAccessory={
        <Grid.Dropdown
          tooltip="Filter by icon pack"
          value={selectedPack}
          onChange={setSelectedPack}
        >
          <Grid.Dropdown.Item
            title="All icon packs"
            value={PACK_FILTER_ALL}
          />
          {packFilterOptions.map((option) => (
            <Grid.Dropdown.Item
              key={option.value}
              title={option.label}
              value={option.value}
            />
          ))}
        </Grid.Dropdown>
      }
    >
      {displayIcons.length === 0 ? (
        <Grid.EmptyView
          title={
            searchText.length >= MIN_SEARCH_LENGTH
              ? "No icons found"
              : selectedPack !== PACK_FILTER_ALL
                ? "No icons found"
                : "Start searching"
          }
          description={
            searchText.length >= MIN_SEARCH_LENGTH
              ? "Try a different search term or pick another icon pack"
              : selectedPack !== PACK_FILTER_ALL
                ? "Try selecting another icon pack"
                : recentIcons.length > 0
                  ? "Your recently copied icons will appear here"
                  : "Type to search for icons"
          }
          icon={Icon.MagnifyingGlass}
        />
      ) : (
        <Grid.Section
          title={
            searchText.length === 0 &&
            selectedPack === PACK_FILTER_ALL &&
            recentIcons.length > 0
              ? "Recently Copied"
              : selectedPack === PACK_FILTER_ALL
                ? "All icon packs"
                : (PACK_LABELS[selectedPack] ?? selectedPack.toUpperCase())
          }
          subtitle={`${displayIcons.length.toLocaleString()} icons`}
        >
          {displayIcons.map((icon: IconEntry) => (
            <Grid.Item
              key={icon.id}
              id={icon.id}
              content={createThemedIcon(icon.iconPath)}
              title={icon.displayName}
              subtitle={icon.nerdFontId}
              keywords={icon.keywords || []}
              actions={
                <IconActions
                  icon={icon}
                  onCopy={(copyType) => {
                    void handleCopyIcon(icon, copyType);
                  }}
                  onClearRecent={
                    recentIcons.length > 0 ? clearRecent : undefined
                  }
                />
              }
            />
          ))}
        </Grid.Section>
      )}
    </Grid>
  );
}
