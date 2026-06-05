import { Action, ActionPanel, Icon, openExtensionPreferences } from "@vicinae/api";

export const PreferencesActionSection = () => (
  <ActionPanel.Section title="Preferences">
    <Action icon={Icon.Cog} title="Open Extension Preferences" onAction={openExtensionPreferences} />
  </ActionPanel.Section>
);
