import { ActionPanel, Action, List, LaunchProps, Icon } from "@vicinae/api";
import { useState, useEffect } from "react";
import { openKCMModule } from "./utils/open-module-command";
import { loadKCMModules, type KCMModule } from "./utils/module-loader";

export default function SearchSettings(props: LaunchProps) {
  const [modules, setModules] = useState<KCMModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState(props.fallbackText || "");

  useEffect(() => {
    const loadedModules = loadKCMModules();
    setModules(loadedModules);
    setIsLoading(false);
  }, []);

  const filteredModules = modules.filter((module: KCMModule) => {
    if (!searchText) return true;

    const search = searchText.toLowerCase();
    const matchesName = module.name.toLowerCase().includes(search);
    const matchesDescription = module.description
      .toLowerCase()
      .includes(search);
    const matchesKeywords = module.keywords.some((keyword: string) =>
      keyword.toLowerCase().includes(search),
    );

    return matchesName || matchesDescription || matchesKeywords;
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
        {filteredModules.length === 0 ? (
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
                    onAction={() => openKCMModule(module.name, module.execCommand)}
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
