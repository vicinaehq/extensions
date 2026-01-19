import { List, ActionPanel, Action, Icon, showToast, Color, LaunchProps, useNavigation, Form, Toast } from "@vicinae/api";
import { getJJBookmarks, JJBookmark } from "./utils/bookmarks";
import { execJJ, JJArguments } from "./utils/exec";
import { RepoPathValidationError } from "./components/validation";
import { CopyIdAction, PushBookmarkAction, TrackRemoteAction, ForgetBookmarkAction, DeleteBookmarkAction, PushAllBookmarksAction, CreateBookmarkAction, BookmarkItemActions } from "./components/actions";
import { getErrorMessage } from "./utils/helpers";

export default function JJBookmarksCommand(props: LaunchProps<{ arguments: JJArguments }>) {
  const { "repo-path": repoPath } = props.arguments;
  const { push } = useNavigation();

  if (!repoPath) {
    return <RepoPathValidationError />;
  }

  const bookmarks: JJBookmark[] = getJJBookmarks(repoPath);

  const items: { title: string; subtitle: string; icon: any; bookmark: JJBookmark; isAction: boolean; accessories: any[] }[] = [];

  // Add existing bookmarks
  bookmarks.forEach((bookmark) => {
    items.push({
      title: bookmark.name,
      subtitle: `${bookmark.change_id.slice(0, 8)} • ${bookmark.remote_refs.length} remote refs`,
      icon: Icon.Tag,
      bookmark: bookmark,
      isAction: false,
      accessories: bookmark.remote_refs.length > 0
        ? [{ text: { value: "Remote", color: Color.Green }, icon: Icon.Dot }]
        : [{ text: { value: "Local", color: Color.Orange }, icon: Icon.Dot }]
    });
  });

  return (
    <List>
      <List.Section title={`Bookmarks - ${repoPath.split('/').pop() || repoPath}`}>
        {items.map((item, index) => (
          <List.Item
            key={index}
            title={item.title}
            subtitle={item.subtitle}
            icon={item.icon}
            accessories={item.accessories}
            actions={
              <ActionPanel>
                <BookmarkItemActions bookmarkName={item.bookmark.name} changeId={item.bookmark.change_id} repoPath={repoPath} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}