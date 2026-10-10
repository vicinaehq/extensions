import { List, ActionPanel, Action, Icon } from "@vicinae/api";
import { useState } from "react";

const grok = { source: "../assets/icons/grok.png"};
const perplexity = { source: "../assets/icons/perplexity.png"};

function formatSearchUrl(url: string, searchText: string): string {
  return url.replace("SEARCH_TERM", encodeURIComponent(searchText));
}

export default function Command() {
  const [searchText, setSearchText] = useState("");

  const aiProviders = [
    {
      name: "Claude",
      url: `https://claude.ai/new?q=SEARCH_TERM`,
      icon: Icon.Claude,
    },
    {
      name: "ChatGPT",
      url: `https://chatgpt.com/?q=SEARCH_TERM`,
      icon: Icon.Openai,
    },
    {
      name: "Perplexity",
      url: `https://www.perplexity.ai/search?q=SEARCH_TERM`,
      icon: perplexity,
    },
    {
      name: "Grok",
      url: `https://www.grok.com/?q=SEARCH_TERM`,
      icon: grok,
    }
  ];

  return (
    <List
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Type your query..."
      throttle
    >
      {aiProviders.map((ai) => (
        <List.Item
          key={ai.name}
          title={ai.name}
          icon={ai.icon}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser
                url={formatSearchUrl(ai.url, searchText)}
                title={`Search on ${ai.name}`}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}