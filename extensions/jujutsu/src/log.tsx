import { List, ActionPanel, Action, Icon, showToast, Color, LaunchProps, Clipboard } from "@vicinae/api";
import { getJJLog, JJChange } from "./utils/log";
import { buildRevisionTree, getAncestryIndicator, RevisionNode } from "./utils/tree";
import { REVSET_PRESETS, JJArguments } from "./utils/cli";
import { RepoPathValidationError } from "./components/validation";
import { CopyIdAction, EditDescriptionAction, NewChangeAction, ChangeItemActions } from "./components/actions";

export default function JJLogCommand(props: LaunchProps<{ arguments: JJArguments }>) {
  const { "repo-path": repoPath } = props.arguments;

  if (!repoPath) {
    return <RepoPathValidationError />;
  }

  const changes: JJChange[] = getJJLog(50, repoPath);
  const treeNodes = buildRevisionTree(changes);

  const renderTreeNode = (node: RevisionNode) => {
    const prefix = getAncestryIndicator(node, treeNodes.length);
    const isWorkingCopy = node.change.is_working_copy;
    const hasBookmarks = node.change.bookmarks.length > 0;

    return (
      <List.Item
        key={node.change.change_id}
        title={node.change.description || "(no description)"}
        subtitle={`${prefix} ${node.change.author} - ${node.change.change_id.slice(0, 8)}`}
        icon={isWorkingCopy ? Icon.CircleFilled : Icon.Circle}
        accessories={[
          {
            text: isWorkingCopy ? { value: "Working Copy", color: Color.Green } : undefined,
            icon: isWorkingCopy ? Icon.CheckCircle : undefined
          },
          ...(hasBookmarks ? [{
            text: node.change.bookmarks.join(", "),
            icon: Icon.Tag,
          }] : [])
        ]}
        actions={
          <ActionPanel>
            <ChangeItemActions changeId={node.change.change_id} commitId={node.change.commit_id} repoPath={repoPath} />
          </ActionPanel>
        }
      />
    );
  };

  return (
    <List>
      <List.Section title="Change Log">
        {treeNodes.map((node) => renderTreeNode(node))}
      </List.Section>
      <List.Section title="Quick Revsets">
        {REVSET_PRESETS.slice(0, 5).map((preset) => (
          <List.Item
            key={preset.name}
            title={preset.name}
            subtitle={`${preset.description} (${preset.query})`}
            icon={Icon.List}
            actions={
              <ActionPanel>
                <Action title="View" onAction={() => {}} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
