import {
  Action,
  ActionPanel,
  Clipboard,
  List,
  LocalStorage,
  getPreferenceValues,
  showHUD,
} from "@vicinae/api";
import { useState, useEffect, useCallback } from "react";
import { generateSuperGenPass } from "./supergenpass-algorithm";

interface Preferences {
  masterPassword: string;
  length: number;
  hashMethod: string;
  removeSubdomains: boolean;
  secret: string;
}

const DOMAIN_HISTORY_KEY = "supergenpass-domain-history";
const MAX_HISTORY_ITEMS = 10;

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const [searchText, setSearchText] = useState("");
  const [domainHistory, setDomainHistory] = useState<string[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    LocalStorage.getItem(DOMAIN_HISTORY_KEY)
      .then((stored) => {
        const history = typeof stored === "string" ? JSON.parse(stored) : [];
        setDomainHistory(history);
        setHistoryLoaded(true);
      })
      .catch(() => {
        setHistoryLoaded(true);
      });
  }, []);

  const updateDomainHistory = useCallback(
    async (updater: (current: string[]) => string[]) => {
      setDomainHistory((current) => {
        const newHistory = updater(current);
        LocalStorage.setItem(
          DOMAIN_HISTORY_KEY,
          JSON.stringify(newHistory),
        ).catch((error) => {
          showHUD(`Storage error: ${error.message}`);
        });
        return newHistory;
      });
    },
    [],
  );

  const addDomainToHistory = useCallback(
    async (domain: string) => {
      await updateDomainHistory((current) => {
        const filtered = current.filter((d) => d !== domain);
        filtered.unshift(domain);
        return filtered.slice(0, MAX_HISTORY_ITEMS);
      });
    },
    [updateDomainHistory],
  );

  const removeDomainFromHistory = useCallback(
    async (domain: string) => {
      await updateDomainHistory((current) => current.filter((d) => d !== domain));
    },
    [updateDomainHistory],
  );

  const generateAndCopyPassword = async (domain: string) => {
    if (!domain.trim()) {
      showHUD("Domain required");
      return;
    }

    if (!preferences.masterPassword) {
      showHUD("Master password required");
      return;
    }

    try {
      const password = generateSuperGenPass(
        preferences.masterPassword,
        domain,
        {
          length: preferences.length,
          method: preferences.hashMethod,
          removeSubdomains: preferences.removeSubdomains,
          secret: preferences.secret,
        },
      );

      await Clipboard.copy(password);
      await addDomainToHistory(domain);

      showHUD(`Password copied for ${domain}`);
    } catch (error) {
      showHUD(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  const filteredHistory = domainHistory.filter((domain) =>
    domain.toLowerCase().includes(searchText.toLowerCase()),
  );

  if (!historyLoaded) {
    return <List searchBarPlaceholder="Loading..." />;
  }

  return (
    <List
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Enter domain or select from history"
    >
      {searchText.trim() && (
        <List.Section title="Current Search">
          <List.Item
            title={`Generate for "${searchText.trim()}"`}
            actions={
              <ActionPanel>
                <Action
                  title="Generate & Copy Password"
                  onAction={() => generateAndCopyPassword(searchText.trim())}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      )}
      <List.Section title="Recent Domains">
        {filteredHistory.map((domain) => (
          <List.Item
            key={domain}
            title={domain}
            actions={
              <ActionPanel>
                <Action
                  title="Generate & Copy Password"
                  onAction={() => generateAndCopyPassword(domain)}
                />
                <Action
                  title="Remove from History"
                  onAction={() => removeDomainFromHistory(domain)}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
