import { List, ActionPanel, Action, showToast, LaunchProps, Color, Detail, Toast, Icon, LaunchType } from "@vicinae/api";
import { execJJ, JJArguments } from "./utils/exec";
import { getErrorMessage } from "./utils/helpers";
import { RepoPathValidationError } from "./components/validation";
import { ViewStatusAction, ViewLogAction, ViewDiffAction, AsyncAction, OpenFileInEditorAction, ResolveItemActions } from "./components/actions";

export default function JJResolveCommand(props: LaunchProps<{ arguments: JJArguments }>) {
  const { "repo-path": repoPath } = props.arguments;

  if (!repoPath) {
    return <RepoPathValidationError />;
  }

  let conflicts: string[] = [];
  let hasConflicts = false;

  try {
    const output = execJJ("status", repoPath);
    hasConflicts = output.includes("conflict") || output.includes("Conflict");
    if (hasConflicts) {
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('conflict') || line.includes('Conflict')) {
          const parts = line.trim().split(/\s+/);
          if (parts.length > 1) {
            conflicts.push(parts[parts.length - 1]);
          }
        }
      }
    }
  } catch (error) {
    return (
      <List>
        <List.Item
          title="Error checking conflicts"
          subtitle={getErrorMessage(error)}
          icon="❌"
        />
      </List>
    );
  }

  if (!hasConflicts) {
    return (
      <Detail
        markdown={`# No Conflicts Found

The working copy appears to be clean with no merge conflicts to resolve.

## What are conflicts?

Conflicts occur when Jujutsu cannot automatically merge changes from different sources. This typically happens during:

- Rebasing changes
- Merging bookmarks
- Pulling from remote repositories

## Resolution Process

When conflicts exist, you'll see conflicted files in \`jj status\`. Use \`jj resolve\` to:

1. **View conflicts** - See the conflicting sections
2. **Edit files** - Manually resolve conflicts by editing the files
3. **Mark as resolved** - Tell JJ the conflicts are fixed

## Commands

- \`jj resolve <file>\` - Resolve conflicts in a specific file
- \`jj resolve\` - Interactive conflict resolution for all files
- \`jj status\` - Check current conflict status`}
        actions={
          <ActionPanel>
            <ViewStatusAction repoPath={repoPath} />
            <ViewLogAction repoPath={repoPath} />
          </ActionPanel>
        }
      />
    );
  }

  const handleResolveAll = async () => {
    execJJ("resolve", repoPath);
    await showToast({
      title: "All conflicts resolved!",
      style: Toast.Style.Success
    });
  };

  const handleResolveFile = async (file: string) => {
    execJJ(`resolve "${file}"`, repoPath);
    await showToast({
      title: `Resolved conflicts in ${file}`,
      style: Toast.Style.Success
    });
  };

  type ResolveItem = {
    title: string;
    subtitle: string;
    icon: string;
    description: string;
    file?: string;
    operation?: () => Promise<void>;
  };

  const items: ResolveItem[] = [
    {
      title: "Resolve All Conflicts",
      subtitle: "Mark all conflicted files as resolved",
      icon: "✅",
      description: "Use this after manually editing all conflicted files to tell JJ the conflicts are resolved.",
      operation: handleResolveAll,
    }
  ];

  conflicts.forEach(file => {
    items.push({
      title: `Resolve ${file}`,
      subtitle: "Mark this file as resolved",
      icon: "📄",
      file: file,
      description: "Mark this specific file as resolved after editing conflicts.",
      operation: () => handleResolveFile(file),
    });
  });

  return (
    <List>
      <List.Section title="Conflict Resolution">
        <List.Item
          title="Conflicts Detected"
          subtitle={`${conflicts.length} file(s) with conflicts`}
          icon={Icon.Warning}
          accessories={[{ text: { value: "Needs Resolution", color: Color.Orange }, icon: "exclamationmark.triangle" }]}
        />
      </List.Section>
      <List.Section title="Resolution Actions">
        {items.map((item, index) => {
          const fileName = item.file ?? "conflicted files";
          return (
            <List.Item
              key={index}
              title={item.title}
              subtitle={item.subtitle}
              icon={item.icon}
              actions={
                <ActionPanel>
                  <ResolveItemActions filePath={fileName} repo={repoPath} operation={item.operation!} />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}
