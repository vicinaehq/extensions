import { Icon, List } from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";
import { Database } from "sql.js";

import {
  createCommonActions,
  getFirefoxProfiles,
  initDatabase,
  Profile,
  showErrorToast,
} from "./utils";

function getFirefoxHistory(db: Database) {
  const history = [];
  const statement = db.prepare(
    `SELECT DISTINCT moz_places.url AS urlString, moz_places.title AS title, MAX(moz_historyvisits.visit_date) AS lastVisitDate FROM moz_places LEFT JOIN moz_historyvisits ON moz_places.id = moz_historyvisits.place_id WHERE moz_places.url IS NOT NULL AND moz_places.hidden = 0 GROUP BY moz_places.url ORDER BY lastVisitDate DESC;`
  );
  while (statement.step()) {
    const row = statement.getAsObject();
    history.push(row);
  }
  statement.free();
  return history;
}

type HistoryItem = {
  id: string;
  title: string;
  url: string;
  domain: string;
  lastVisitDate: number;
};

export default function Command() {
  const [, setProfiles] = useState<Profile[]>([]);
  const [currentProfile, setCurrentProfile] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const { profiles, defaultProfile } = await getFirefoxProfiles();
        if (profiles.length === 0) {
          await showErrorToast(
            "No Firefox profiles found",
            "No Firefox profiles detected on this system."
          );
        }
        setProfiles(profiles);
        setCurrentProfile(defaultProfile);
      } catch (error) {
        await showErrorToast("Error loading profiles", String(error));
        setProfiles([]);
        setCurrentProfile("");
      }
      setIsLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!currentProfile) return;
    (async () => {
      setIsLoading(true);
      try {
        console.log("[DEBUG] Loading profile:", currentProfile);

        const db = await initDatabase(currentProfile);

        const rawHistory = getFirefoxHistory(db);

        const history = rawHistory.map((item) => {
          let domain = "";
          const url = typeof item.urlString === "string" ? item.urlString : "";
          try {
            if (url) {
              domain = new URL(url).hostname;
            }
          } catch {
            // Ignore invalid URLs
          }

          return {
            id: url,
            title:
              typeof item.title === "string" && item.title
                ? item.title
                : url || "Untitled",
            url,
            domain,
            lastVisitDate:
              typeof item.lastVisitDate === "number" ? item.lastVisitDate : 0,
          };
        });
        setHistory(history);
      } catch (error) {
        await showErrorToast("Error loading history", String(error));
        setHistory([]);
      }
      setIsLoading(false);
    })();
  }, [currentProfile]);

  const filteredHistory = useMemo(() => {
    return history.filter(
      (item) =>
        item.title.toLowerCase().includes(query.toLowerCase()) ||
        item.url.toLowerCase().includes(query.toLowerCase())
    );
  }, [history, query]);

  const formatDate = (timestamp: number) => {
    if (timestamp === 0) return "";
    const date = new Date(timestamp / 1000); // Firefox stores microseconds, but actually it's microseconds since 1970-01-01
    return date.toLocaleDateString();
  };

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search Firefox history"
      onSearchTextChange={setQuery}
    >
      {filteredHistory.slice(0, 100).map((item) => (
        <List.Item
          key={item.id}
          icon={Icon.Globe}
          title={item.title}
          subtitle={item.domain ?? ""}
          accessories={[{ text: formatDate(item.lastVisitDate) }]}
          actions={createCommonActions(item.url)}
        />
      ))}
      <List.EmptyView
        title="No Firefox history found"
        description="No browsing history available in Firefox."
        icon={Icon.Globe}
      />
    </List>
  );
}
