import {
  ActionPanel,
  Action,
  List,
  LaunchProps,
  Icon,
  getPreferenceValues,
} from "@vicinae/api";
import { useState, useEffect } from "react";
import { openKCMModule } from "./utils/open-module-command";
import { loadKCMModules, type KCMModule } from "./utils/module-loader";

interface Preferences {
  showKDE5Modules: boolean;
}

export default function SearchSettings(props: LaunchProps) {
  const [modules, setModules] = useState<KCMModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState(props.fallbackText || "");
  const preferences = getPreferenceValues<Preferences>();

  useEffect(() => {
    const loadModules = async () => {
      const loadedModules = await loadKCMModules();
      const filteredModules = preferences.showKDE5Modules
        ? loadedModules
        : loadedModules.filter((m) => !m.isKDE5);

      setModules(filteredModules);
      setIsLoading(false);
    };

    loadModules();
  }, [preferences.showKDE5Modules]);

  const filteredModules = modules
    .filter((module: KCMModule) => {
      if (!searchText) return true;

      const searchWords = searchText
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 0);

      const matchesName = searchWords.every((word) =>
        module.name.toLowerCase().includes(word)
      );

      const matchesDescription = searchWords.every((word) =>
        module.description.toLowerCase().includes(word)
      );

      const matchesKeywords = searchWords.every((word) =>
        module.keywords.some((keyword) => keyword.toLowerCase().includes(word))
      );

      return matchesName || matchesDescription || matchesKeywords;
    })
    .sort((a, b) => {
      if (!searchText) return a.name.localeCompare(b.name);

      const searchWords = searchText
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 0);

      const aMatchesName = searchWords.every((word) =>
        a.name.toLowerCase().includes(word)
      );
      const bMatchesName = searchWords.every((word) =>
        b.name.toLowerCase().includes(word)
      );

      if (aMatchesName && !bMatchesName) return -1;
      if (!aMatchesName && bMatchesName) return 1;

      return a.name.localeCompare(b.name);
    });

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search KDE System Settings..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
    >
      <List.Section
        title={`Available KDE Settings Modules (${filteredModules.length})`}
      >
        {filteredModules.length === 0 && !isLoading ? (
          <List.Item
            title="No modules found"
            subtitle="Try adjusting your search terms or check if KDE settings modules are installed"
            icon={Icon.MagnifyingGlass}
          />
        ) : (
          filteredModules.map((module: KCMModule) => (
            <List.Item
              key={module.id}
              title={module.name}
              subtitle={
                module.description !== module.name ? module.description : ""
              }
              icon={module.icon}
              keywords={module.keywords}
              actions={
                <ActionPanel>
                  <Action
                    title="Open Settings Module"
                    icon={Icon.Gear}
                    onAction={() =>
                      openKCMModule(module.name, module.execCommand)
                    }
                  />
                  <Action.CopyToClipboard
                    title="Copy Module ID"
                    content={module.id}
                  />
                  <Action.CopyToClipboard
                    title="Copy Command"
                    content={module.execCommand}
                  />
                </ActionPanel>
              }
            />
          ))
        )}
      </List.Section>
    </List>
  );
}
