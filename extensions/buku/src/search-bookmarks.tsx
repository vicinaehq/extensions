import { Alert, List, confirmAlert } from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import { BookmarkEmptyState } from "./components/bookmark-empty-state";
import { BookmarkItem } from "./components/bookmark-item";
import { type Bookmark, deleteBookmark, listBookmarks } from "./lib/buku";
import { showBukuFailure, showSuccess } from "./lib/toast";

export default function SearchBookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [showingDetail, setShowingDetail] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBookmarks(await listBookmarks());
      setError(null);
    } catch (caught) {
      setBookmarks([]);
      setError(caught);
      await showBukuFailure("Could not read bookmarks", caught);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = useCallback(
    async (bookmark: Bookmark) => {
      const confirmed = await confirmAlert({
        title: "Delete bookmark?",
        message: bookmark.title || bookmark.uri,
        primaryAction: {
          title: "Delete",
          style: Alert.ActionStyle.Destructive,
        },
      });

      if (!confirmed) return;

      try {
        await deleteBookmark(bookmark);
        await showSuccess("Deleted", bookmark.title || bookmark.uri);
        await load();
      } catch (caught) {
        await showBukuFailure("Delete failed", caught);
      }
    },
    [load],
  );

  const toggleDetail = useCallback(() => setShowingDetail((shown) => !shown), []);

  return (
    <List isLoading={loading} isShowingDetail={showingDetail} searchBarPlaceholder="Search bookmarks...">
      <BookmarkEmptyState hasBookmarks={bookmarks.length > 0} error={error} loading={loading} onReload={load} />
      <List.Section title={`Bookmarks (${bookmarks.length})`}>
        {bookmarks.map((bookmark) => (
          <BookmarkItem
            key={bookmark.index}
            bookmark={bookmark}
            showingDetail={showingDetail}
            onReload={load}
            onRemove={remove}
            onToggleDetail={toggleDetail}
          />
        ))}
      </List.Section>
    </List>
  );
}
