import { useMemo } from "react";

import { Action, ActionPanel, Icon, getFrontmostApplication } from "@vicinae/api";
import { usePromise } from "@raycast/utils";

import { useListContext } from "~/context";
import type { Character } from "~/types";
import { numberToHex } from "~/helpers/string";

export const CharacterActionPanel = ({ item }: { item: Character }) => {
  const { data: frontmostApp } = usePromise(getFrontmostApplication, []);
  const { findHtmlEntity } = useListContext();
  const html = findHtmlEntity(item.c);

  const { addToRecentlyUsedItems, isRecentlyUsed, clearRecentlyUsedItems, removeFromRecentlyUsedItems } =
    useListContext();
  const recentlyUsed = useMemo(() => isRecentlyUsed(item), [isRecentlyUsed, item]);

  const copyAction = useMemo(() => {
    return (
      <Action.CopyToClipboard
        title="Copy Character to Clipboard"
        content={item.v}
        onCopy={() => addToRecentlyUsedItems(item)}
      />
    );
  }, [item, addToRecentlyUsedItems]);

  const pasteAction = useMemo(() => {
    return (
      <Action.Paste
        title={`Paste Character to ${frontmostApp?.name || "Active App"}`}
        content={item.v}
        icon={Icon.Clipboard}
        onPaste={() => addToRecentlyUsedItems(item)}
      />
    );
  }, [frontmostApp, item, addToRecentlyUsedItems]);

  return (
    <ActionPanel>
      <ActionPanel.Section title="Main">
        {pasteAction}
        {copyAction}
      </ActionPanel.Section>
      <ActionPanel.Section title="Other options">
        <Action.CopyToClipboard
          title="Copy Hex Code to Clipboard"
          content={numberToHex(item.c)}
          onCopy={() => addToRecentlyUsedItems(item)}
          shortcut={{ modifiers: ["ctrl"], key: "h" }}
        />
        {html ? (
          <Action.CopyToClipboard
            title="Copy HTML Entity to Clipboard"
            content={html}
            onCopy={() => addToRecentlyUsedItems(item)}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "h" }}
          />
        ) : null}
        <Action.CopyToClipboard
          title="Copy HTML Code to Clipboard"
          content={`&#${item.c};`}
          onCopy={() => addToRecentlyUsedItems(item)}
          shortcut={{
            modifiers: ["ctrl", "shift"],
            key: html !== null ? "t" : "h",
          }}
        />
      </ActionPanel.Section>
      <ActionPanel.Section title="Others">
        <Action.OpenInBrowser
          title="Open Character on Compart"
          icon={Icon.Globe}
          url={`https://www.compart.com/en/unicode/U+${numberToHex(item.c)}`}
        />
        {recentlyUsed ? (
          <>
            <Action
              title="Remove from Recently Used"
              icon={Icon.Trash}
              style="destructive"
              onAction={() => removeFromRecentlyUsedItems(item)}
            />
            <Action
              title="Remove All from Recently Used"
              icon={Icon.Trash}
              style="destructive"
              onAction={() => clearRecentlyUsedItems()}
            />
          </>
        ) : null}
      </ActionPanel.Section>
    </ActionPanel>
  );
};
