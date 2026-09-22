import { getPreferenceValues, List } from "@vicinae/api";
import colorNamer from "color-namer";
import { useEffect, useState } from "react";
import { ColorNameListItem } from "./components/ColorNames";
import type { ColorNamesPreferences, SortType } from "./lib/types";
import { getColorByPlatform, getColorByProximity, normalizeColorHex } from "./lib/utils";

export default function ColorNames() {
  const [isSearching, setIsSearching] = useState(false);
  const [searchString, setSearchString] = useState<string>("#FF6363");
  const [colors, setColors] = useState<colorNamer.Colors<colorNamer.Palette>>();
  const [sortBy, setSortBy] = useState<SortType>("platform");
  const normalizedSearchString = normalizeColorHex(searchString);

  let colorNamesPerGroup = "5";
  try {
    const prefs = getPreferenceValues<ColorNamesPreferences>();
    if (prefs?.colorNamesPerGroup) {
      colorNamesPerGroup = prefs.colorNamesPerGroup;
    }
  } catch {
    // default
  }

  const loadColors = (hexStr: string) => {
    setIsSearching(true);
    try {
      const result = colorNamer(hexStr);
      setColors(result);
    } catch {
      setColors(undefined);
    }
    setIsSearching(false);
  };

  useEffect(() => {
    loadColors(normalizedSearchString);
  }, [normalizedSearchString]);

  return (
    <List
      isLoading={isSearching}
      onSearchTextChange={setSearchString}
      searchBarPlaceholder="Search HEX (#00ff00, #ff6363...)"
      searchBarAccessory={
        <List.Dropdown
          tooltip="Sort colors by"
          onChange={(v) => {
            setSortBy(v as SortType);
          }}
        >
          <List.Dropdown.Item value="platform" title="Sort by Platform" />
          <List.Dropdown.Item value="proximity" title="Sort by Proximity" />
        </List.Dropdown>
      }
    >
      {colors ? (
        sortBy === "platform" ? (
          getColorByPlatform(normalizedSearchString, colors).map(([palette, colorList]) => (
            <List.Section key={palette} title={palette}>
              {colorList.slice(0, Number(colorNamesPerGroup)).map((color, index) => (
                <ColorNameListItem key={`color-name-${color.name}-${index}`} color={color} />
              ))}
            </List.Section>
          ))
        ) : (
          getColorByProximity(colors).map((color, index) => (
            <ColorNameListItem key={`color-name-${color.name}-${index}`} color={color} />
          ))
        )
      ) : (
        <List.EmptyView title={searchString ? "No colors found" : "Search for a color"} />
      )}
    </List>
  );
}
