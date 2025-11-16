import React, { useEffect, useState } from 'react';
import { ActionPanel, Action, List, Icon, closeMainWindow } from '@vicinae/api';
import { isBtInstalled, getTabs, closeTab, activateTab } from './brotab';
import type { Tab } from './types';

export default function Command() {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        const ok = await isBtInstalled();
        setInstalled(ok);
        if (!ok) {
          // Stop loading if not installed; nothing else to fetch
          setIsLoading(false);
        }
      } catch {
        setInstalled(false);
        setIsLoading(false);
      }
    })();
  }, []);

  // Fetch tabs when Brotab is confirmed installed
  useEffect(() => {
    if (installed !== true) return;
    (async () => {
      try {
        setIsLoading(true);
        const list = await getTabs();
        setTabs(list);
      } catch {
        // Silently ignore; keep the list empty
        setTabs([]);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [installed]);

  if (installed === false) {
    return (
      <List navigationTitle="Tabs List" isLoading={false}>
        <List.EmptyView
          icon={Icon.Warning}
          title="Brotab Not Installed"
          description="Brotab command-line tool is not installed on your system.<br/><br/> Please install it to use this extension, by following the instructions in the <a href=https://github.com/balta2ar/brotab?tab=readme-ov-file#installation>official guide</a>."
        />
      </List>
    );
  }

  return (
    <List navigationTitle="Tabs List" isLoading={isLoading}>
      <List.Section title={`Open Tabs (${tabs.length})`}>
        {tabs.length === 0 ? (
          !isLoading ? (
            <List.EmptyView
              title="No tabs found"
              description="No browser tabs detected by Brotab."
            />
          ) : null
        ) : (
          tabs.map((tab) => (
            <List.Item
              key={tab.id}
              title={tab.title || tab.url}
              subtitle={tab.url}
              actions={
                <ActionPanel>
                  <Action
                    title="Activate Tab"
                    icon={Icon.ArrowRight}
                    onAction={async () => {
                      await activateTab(tab.id);
                      closeMainWindow();
                    }}
                  />
                  <Action
                    title="Close Tab"
                    icon={Icon.XMarkCircle}
                    shortcut={{ modifiers: ['ctrl'], key: 'x' }}
                    onAction={async () => {
                      await closeTab(tab.id);
                      setTabs((prev) => prev.filter((t) => t.id !== tab.id));
                    }}
                  />
                  <Action.CopyToClipboard
                    title="Copy URL to Clipboard"
                    icon={Icon.CopyClipboard}
                    shortcut={{ modifiers: ['ctrl'], key: 'c' }}
                    content={tab.url}
                  />
                  <Action
                    title="Refresh"
                    icon={Icon.ArrowClockwise}
                    shortcut={{ modifiers: ['ctrl'], key: 'r' }}
                    onAction={async () => {
                      const list = await getTabs();
                      setTabs(list);
                    }}
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
