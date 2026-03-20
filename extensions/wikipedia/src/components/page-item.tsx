import { Action, ActionPanel, Grid, Icon, Keyboard, List } from "@vicinae/api";
import { useEffect, useState } from "react";

import { getPageData, type PageSummary } from "../utils/api";
import { toSentenceCase } from "../utils/formatting";
import { Locale } from "../utils/language";
import { prefersListView } from "../utils/preferences";
import { useRecentArticles } from "../hooks/useRecentArticles";

import WikipediaPage from "./wikipedia-page";

const View = prefersListView ? List : Grid;

export function PageItem({ search, title, language }: { search: string; title: string; language: Locale }) {
  const [page, setPage] = useState<PageSummary | undefined>(undefined);
  const { clearReadArticles, removeFromReadArticles } = useRecentArticles();

  useEffect(() => {
    let cancelled = false;
    getPageData(title, language).then((data) => {
      if (!cancelled) setPage(data);
    });
    return () => {
      cancelled = true;
    };
  }, [title, language]);

  return (
    <View.Item
      content={{ source: page?.thumbnail?.source || Icon.Image }}
      icon={{ source: page?.thumbnail?.source || Icon.Globe }}
      id={title}
      title={title}
      subtitle={page?.description ? toSentenceCase(page.description) : ""}
      actions={
        <ActionPanel>
          {page?.content_urls && (
            <>
              <Action.Push
                icon={Icon.Window}
                title="Show Details"
                target={<WikipediaPage title={title} language={language} />}
              />
              <Action.OpenInBrowser url={page?.content_urls.desktop.page || ""} />
            </>
          )}
          <Action.OpenInBrowser
            title="Search in Browser"
            url={`https://${language}.wikipedia.org/w/index.php?fulltext=1&profile=advanced&search=${search}&title=Special%3ASearch&ns0=1`}
            shortcut={{ modifiers: ["ctrl"], key: "o" }}
          />
          <ActionPanel.Section>
            {page?.content_urls && (
              <Action.CopyToClipboard
                shortcut={{ modifiers: ["ctrl"], key: "." }}
                title="Copy URL"
                content={page?.content_urls.desktop.page || ""}
              />
            )}
            {page?.content_urls && (
              <Action.CopyToClipboard
                shortcut={{ modifiers: ["ctrl", "shift"], key: "." }}
                title="Copy Title"
                content={title}
              />
            )}
            <Action.CopyToClipboard
              shortcut={{ modifiers: ["ctrl", "shift"], key: "," }}
              title="Copy Subtitle"
              content={page?.description ?? ""}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action
              title="Delete Recent Article"
              style={Action.Style.Destructive}
              shortcut={Keyboard.Shortcut.Common.Remove}
              icon={Icon.Trash}
              onAction={() => removeFromReadArticles({ title, language })}
            />
            <Action
              title="Delete All Recent Articles"
              style={Action.Style.Destructive}
              shortcut={Keyboard.Shortcut.Common.RemoveAll}
              icon={Icon.Trash}
              onAction={clearReadArticles}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
