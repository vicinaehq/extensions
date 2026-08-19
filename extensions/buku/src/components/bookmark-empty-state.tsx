import { Action, ActionPanel, Icon, Keyboard, List, openExtensionPreferences } from "@vicinae/api";
import { BUKU_MISSING_HINT, isBukuMissing } from "../lib/buku";
import { describeError } from "../lib/toast";
import { BookmarkForm } from "./bookmark-form";

export type BookmarkEmptyStateProps = {
  /** Whether buku returned any bookmarks at all, as opposed to none matching the search. */
  hasBookmarks: boolean;
  error: unknown;
  loading: boolean;
  onReload: () => void;
};

/**
 * Tells apart the four states the list can be in with nothing to show: still loading,
 * buku missing, buku failing, and an empty or unmatched bookmark set.
 */
export function BookmarkEmptyState({ hasBookmarks, error, loading, onReload }: BookmarkEmptyStateProps) {
  if (loading) return null;

  const reload = (
    <Action
      title="Try Again"
      icon={Icon.ArrowClockwise}
      shortcut={Keyboard.Shortcut.Common.Refresh}
      onAction={onReload}
    />
  );

  if (error) {
    const missing = isBukuMissing(error);

    return (
      <List.EmptyView
        icon={Icon.XMarkCircle}
        title={missing ? "buku not found" : "Could not read bookmarks"}
        description={missing ? BUKU_MISSING_HINT : describeError(error)}
        actions={
          <ActionPanel>
            {reload}
            <Action title="Open Extension Preferences" icon={Icon.Cog} onAction={openExtensionPreferences} />
          </ActionPanel>
        }
      />
    );
  }

  if (!hasBookmarks) {
    return (
      <List.EmptyView
        icon={Icon.Bookmark}
        title="No bookmarks yet"
        description="Press Enter to add your first one."
        actions={
          <ActionPanel>
            <Action.Push title="Add Bookmark" icon={Icon.Plus} target={<BookmarkForm onSaved={onReload} />} />
            {reload}
          </ActionPanel>
        }
      />
    );
  }

  return (
    <List.EmptyView
      icon={Icon.MagnifyingGlass}
      title="No matching bookmarks"
      description="Try a different search term, or search by tag."
    />
  );
}
