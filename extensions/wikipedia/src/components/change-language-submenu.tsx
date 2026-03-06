import { Action, ActionPanel } from "@vicinae/api";

import { useAvailableLanguages } from "../hooks/usePageData";
import { languages } from "../utils/language";

import WikipediaPage from "./wikipedia-page";

export function ChangeLanguageSubmenu({ title, language }: { title: string; language: string }) {
  const { data: availableLanguages } = useAvailableLanguages(title, language);

  return (
    <ActionPanel.Submenu
      shortcut={{ modifiers: ["ctrl"], key: "p" }}
      title="Change Language"
      icon={languages.find((l) => l.value === language)?.icon}
    >
      {languages
        .filter(({ value }) => value !== language)
        .map(({ value, icon, title }) => {
          const translatedTitle = availableLanguages?.find(({ lang }) => lang === value)?.title;
          if (!translatedTitle) {
            return null;
          }

          return (
            <Action.Push
              key={value}
              icon={icon}
              title={title}
              target={<WikipediaPage title={translatedTitle} language={value} />}
            />
          );
        })}
    </ActionPanel.Submenu>
  );
}
