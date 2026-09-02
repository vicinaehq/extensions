import { Action, ActionPanel, Color, Icon, Keyboard, List } from "@vicinae/api";
import { type Bookmark, bookmarkTags } from "../lib/buku";
import { BookmarkDetail } from "./bookmark-detail";
import { BookmarkForm } from "./bookmark-form";

// Vicinae binds Ctrl+D to its Duplicate action, so the detail toggle takes Ctrl+Shift+D.
const TOGGLE_DETAIL_SHORTCUT: Keyboard.Shortcut = {
  modifiers: ["ctrl", "shift"],
  key: "d",
};

export type BookmarkItemProps = {
  bookmark: Bookmark;
  showingDetail: boolean;
  onReload: () => void;
  onRemove: (bookmark: Bookmark) => void;
  onToggleDetail: () => void;
};

export function BookmarkItem({ bookmark, showingDetail, onReload, onRemove, onToggleDetail }: BookmarkItemProps) {
  const tags = bookmarkTags(bookmark);

  return (
    <List.Item
      title={bookmark.title || bookmark.uri}
      subtitle={showingDetail ? undefined : bookmark.uri}
      keywords={tags}
      // The list column is narrow next to the detail pane, so the tag chips only
      // earn their space when the pane is closed.
      accessories={
        showingDetail
          ? undefined
          : tags.map((tag) => ({
              tag: { value: tag, color: Color.SecondaryText },
            }))
      }
      detail={showingDetail ? <BookmarkDetail bookmark={bookmark} /> : undefined}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser title="Open in Browser" url={bookmark.uri} />
          <Action.CopyToClipboard title="Copy URL" content={bookmark.uri} shortcut={Keyboard.Shortcut.Common.Copy} />
          <Action.Push
            title="Edit"
            icon={Icon.Pencil}
            shortcut={Keyboard.Shortcut.Common.Edit}
            target={<BookmarkForm bookmark={bookmark} onSaved={onReload} />}
          />
          <Action.Push
            title="Add Bookmark"
            icon={Icon.Plus}
            shortcut={Keyboard.Shortcut.Common.New}
            target={<BookmarkForm onSaved={onReload} />}
          />
          <Action
            title="Delete"
            style={Action.Style.Destructive}
            icon={Icon.Trash}
            shortcut={Keyboard.Shortcut.Common.Remove}
            onAction={() => onRemove(bookmark)}
          />
          <ActionPanel.Section title="View">
            <Action
              title={showingDetail ? "Hide Details" : "Show Details"}
              icon={showingDetail ? Icon.EyeDisabled : Icon.AppWindowSidebarRight}
              shortcut={TOGGLE_DETAIL_SHORTCUT}
              onAction={onToggleDetail}
            />
            <Action
              title="Refresh"
              icon={Icon.ArrowClockwise}
              shortcut={Keyboard.Shortcut.Common.Refresh}
              onAction={onReload}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
