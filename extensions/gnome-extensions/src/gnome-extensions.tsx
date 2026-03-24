import React, { JSX, useCallback, useEffect, useState } from "react";
import { Action, ActionPanel, getPreferenceValues, Icon, List, open } from "@vicinae/api";
import { ExtensionListItem } from "./components/extension-list-item";
import { GnomeExtension } from "./interfaces/gnome-extension";
import { Preferences } from "./interfaces/preferences";
import { extensionList } from "./components/extension-list";

// noinspection JSUnusedGlobalSymbols
export default function Command(): JSX.Element {
  const preferences = getPreferenceValues<Preferences>();
  const [extensions, setExtensions] = useState<GnomeExtension[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [isShowingDetail, setIsShowingDetail] = useState(false);

  const loadExtensions = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);

    try {
      const extensions = await extensionList();

      if (0 === extensions.length) {
        setError("No GNOME extensions found. Make sure gnome-extensions CLI is installed.");
      } else {
        setExtensions(extensions);
      }
    } catch {
      setError("Failed to load GNOME extensions");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExtensions().then(null);
  }, [loadExtensions]);

  const filteredExtensions = extensions.filter(ext => {
    if (preferences.showDisabled) return true;
    return ext.enabled;
  });

  const enabledCount = extensions.filter(e => e.enabled).length;
  const disabledCount = extensions.filter(e => !e.enabled).length;

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={isShowingDetail}
      searchBarPlaceholder="Search extensions..."
      actions={(
        <ActionPanel>
          <Action title="Reload Extensions" icon={Icon.RotateAntiClockwise} onAction={loadExtensions} />
          <Action title="Open Extension Manager" icon={Icon.AppWindow} onAction={() => open("gnome-extensions")} />
          <Action
            title="Browse Extensions"
            icon={Icon.Globe01}
            onAction={() => open("https://extensions.gnome.org/")}
          />
        </ActionPanel>
      )}
    >
      <List.Section
        title={`Enabled (${enabledCount})`}
        subtitle={preferences.showDisabled ? `Disabled (${disabledCount})` : undefined}
      >
        {filteredExtensions.map(extension => (
          <ExtensionListItem
            key={extension.uuid}
            extension={extension}
            isShowingDetail={isShowingDetail}
            onToggleDetail={() => setIsShowingDetail(!isShowingDetail)}
            onReload={loadExtensions}
          />
        ))}
      </List.Section>

      {!isLoading && 0 === filteredExtensions.length && !error && (
        <List.EmptyView
          icon={Icon.AppWindow}
          title="No extensions found"
          description={
            preferences.showDisabled
              ? "No GNOME extensions are installed"
              : "All extensions are disabled. Enable showDisabled to see them."
          }
          actions={(
            <ActionPanel>
              <Action title="Reload" icon={Icon.RotateAntiClockwise} onAction={loadExtensions} />
              <Action
                title="Browse Extensions"
                icon={Icon.Globe01}
                onAction={() => open("https://extensions.gnome.org/")}
              />
            </ActionPanel>
          )}
        />
      )}

      {error && (
        <List.EmptyView
          icon={Icon.Warning}
          title="Error loading extensions"
          description={error}
          actions={(
            <ActionPanel>
              <Action title="Reload" icon={Icon.RotateAntiClockwise} onAction={loadExtensions} />
            </ActionPanel>
          )}
        />
      )}
    </List>
  );
}
