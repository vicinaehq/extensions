import { Action, ActionPanel, List, Icon, Keyboard } from "@vicinae/api";
import { useState, useCallback } from "react";

export default function AskInBrowser() {
  const [searchText, setSearchText] = useState("");

  const handleSearchTextChange = useCallback((text: string) => {
    setSearchText(text);
  }, []);

  const buildUrl = useCallback((query: string) => {
    return `https://www.google.com/search?udm=50&q=${encodeURIComponent(query)}`;
  }, []);

  return (
    <List
      navigationTitle="Ask in Browser"
      searchBarPlaceholder="Search with Google AI..."
      filtering={false}
      searchText={searchText}
      onSearchTextChange={handleSearchTextChange}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.OpenInBrowser
              url={buildUrl(searchText)}
              title="Ask in Browser"
              icon={Icon.Globe01}
              shortcut={Keyboard.Shortcut.Common.Open}
              autoFocus
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    >
      <List.EmptyView
        icon={Icon.Globe01}
        title="Search with Google AI"
        description="Type a question and press Enter to AI search in your browser."
      />
    </List>
  );
}
