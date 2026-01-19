import { List, ActionPanel, Action, Icon, showToast, Color, LaunchProps, useNavigation, Clipboard, Form, Toast } from "@vicinae/api";
import { getJJBookmarks, JJBookmark, pushToGit, forgetBookmark, execJJ } from "./utils";
import { NavigationActions } from "./actions";

interface Arguments {
  "repo-path": string;
}

export default function JJBookmarks(props: LaunchProps<{ arguments: Arguments }>) {
  const { "repo-path": repoPath } = props.arguments;
  const { push } = useNavigation();

  if (!repoPath) {
    return (
      <List>
        <List.Item
          title="Repository path required"
          subtitle="Provide a repository path as argument"
          icon={Icon.Warning}
        />
      </List>
    );
  }

  const bookmarks: JJBookmark[] = getJJBookmarks(repoPath);

  const handleCreateBookmark = () => {
    push(<CreateBookmarkForm repoPath={repoPath} />);
  };

  const handleTrackRemote = async (bookmarkName: string) => {
    try {
      execJJ(`bookmark track ${bookmarkName}@origin`, repoPath);
      await showToast({
        title: "Remote tracked",
        message: `Now tracking ${bookmarkName} from origin`,
        style: Toast.Style.Success
      });
    } catch (error) {
      await showToast({
        title: "Failed to track remote",
        message: error instanceof Error ? error.message : "Unknown error",
        style: Toast.Style.Failure
      });
    }
  };

  const handleDeleteBookmark = async (bookmarkName: string) => {
    try {
      execJJ(`bookmark delete ${bookmarkName}`, repoPath);
      await showToast({
        title: "Bookmark deleted",
        message: `Deleted bookmark ${bookmarkName}`,
        style: Toast.Style.Success
      });
    } catch (error) {
      await showToast({
        title: "Failed to delete bookmark",
        message: error instanceof Error ? error.message : "Unknown error",
        style: Toast.Style.Failure
      });
    }
  };

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
                <ActionPanel.Section>
                  <Action
                    title="Copy Bookmark Name"
                    onAction={async () => {
                      await Clipboard.copy(item.bookmark.name);
                      await showToast({ title: "Copied bookmark name!" });
                    }}
                    shortcut={{ modifiers: ["ctrl"], key: "c" }}
                  />
                  <Action
                    title="Copy Change ID"
                    onAction={async () => {
                      await Clipboard.copy(item.bookmark.change_id);
                      await showToast({ title: "Copied change ID!" });
                    }}
                    shortcut={{ modifiers: ["ctrl", "shift"], key: "c" }}
                  />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action
                    title="Push to Remote"
                    onAction={async () => {
                      try {
                        const result = pushToGit(item.bookmark.name, repoPath);
                        await showToast({
                          title: "Pushed successfully",
                          message: result,
                          style: Toast.Style.Success
                        });
                      } catch (error) {
                        await showToast({
                          title: "Failed to push",
                          message: error instanceof Error ? error.message : "Unknown error",
                          style: Toast.Style.Failure
                        });
                      }
                    }}
                    shortcut={{ modifiers: ["ctrl"], key: "p" }}
                  />
                  <Action
                    title="Track Remote"
                    onAction={() => handleTrackRemote(item.bookmark.name)}
                    shortcut={{ modifiers: ["ctrl"], key: "t" }}
                  />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action
                    title="Forget Bookmark"
                    onAction={async () => {
                      try {
                        forgetBookmark(item.bookmark.name, repoPath);
                        await showToast({
                          title: "Bookmark forgotten",
                          message: `Forgot bookmark ${item.bookmark.name}`,
                          style: Toast.Style.Success
                        });
                      } catch (error) {
                        await showToast({
                          title: "Failed to forget bookmark",
                          message: error instanceof Error ? error.message : "Unknown error",
                          style: Toast.Style.Failure
                        });
                      }
                    }}
                    shortcut={{ modifiers: ["ctrl"], key: "f" }}
                  />
                  <Action
                    title="Delete Bookmark"
                    onAction={() => handleDeleteBookmark(item.bookmark.name)}
                    style="destructive"
                    shortcut={{ modifiers: ["ctrl"], key: "delete" }}
                  />
                </ActionPanel.Section>
                {NavigationActions.createCrossNavigation(repoPath, push, "bookmarks")}
                <ActionPanel.Section>
                  <Action
                    title="Create New Bookmark..."
                    onAction={handleCreateBookmark}
                    icon={Icon.Plus}
                    shortcut={{ modifiers: ["ctrl"], key: "n" }}
                  />
                  <Action
                    title="Push All Bookmarks"
                    onAction={async () => {
                      try {
                        const result = pushToGit(undefined, repoPath);
                        await showToast({
                          title: "All bookmarks pushed",
                          message: result,
                          style: Toast.Style.Success
                        });
                      } catch (error) {
                        await showToast({
                          title: "Failed to push all",
                          message: error instanceof Error ? error.message : "Unknown error",
                          style: Toast.Style.Failure
                        });
                      }
                    }}
                    shortcut={{ modifiers: ["ctrl", "shift"], key: "p" }}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}

// Create bookmark form
function CreateBookmarkForm({ repoPath }: { repoPath: string }) {
  const { push } = useNavigation();

  const handleSubmit = async (values: Form.Values) => {
    const name = values.name as string;
    const revision = values.revision as string;
    try {
      const revArg = revision ? ` -r ${revision}` : "";
      execJJ(`bookmark create ${name}${revArg}`, repoPath);
      await showToast({
        title: "Bookmark created",
        message: `Created bookmark '${name}'`,
        style: Toast.Style.Success
      });
    } catch (error) {
      await showToast({
        title: "Failed to create bookmark",
        message: error instanceof Error ? error.message : "Unknown error",
        style: Toast.Style.Failure
      });
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Bookmark" onSubmit={handleSubmit} />
          {NavigationActions.createCrossNavigation(repoPath, push, "bookmarks")}
        </ActionPanel>
      }
    >
      <Form.TextField
        title="Bookmark Name"
        id="name"
      />
      <Form.TextField
        title="Revision (optional)"
        id="revision"
      />
    </Form>
  );
}