import { List, ActionPanel, Action, showToast, LaunchProps, useNavigation, Color, Detail, Toast, Icon, LaunchType } from "@vicinae/api";
import { execJJ } from "./utils";
import JJStatus from "./status";
import JJLog from "./log";
import JJDiff from "./diff";

interface Arguments {
  "repo-path": string;
}

export default function JJResolve(props: LaunchProps<{ arguments: Arguments }>) {
  const { "repo-path": repoPath } = props.arguments;
  const { push } = useNavigation();
  const launchStatus = () => push(<JJStatus launchType={LaunchType.UserInitiated} arguments={{ "repo-path": repoPath }} />);
  const launchLog = () => push(<JJLog launchType={LaunchType.UserInitiated} arguments={{ "repo-path": repoPath }} />);
  const launchDiff = () => push(<JJDiff launchType={LaunchType.UserInitiated} arguments={{ "repo-path": repoPath }} />);

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

  // Check for conflicts
  let conflicts: string[] = [];
  let hasConflicts = false;

  try {
    const output = execJJ("status", repoPath);
    hasConflicts = output.includes("conflict") || output.includes("Conflict");
    if (hasConflicts) {
      // Parse conflict files from status output
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('conflict') || line.includes('Conflict')) {
          // Try to extract file path - this is a simple heuristic
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
          subtitle={error instanceof Error ? error.message : "Unknown error"}
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
            <Action
              title="Check Status"
              onAction={launchStatus}
              shortcut={{ modifiers: ["ctrl"], key: "s" }}
            />
            <Action
              title="View Log"
              onAction={launchLog}
              shortcut={{ modifiers: ["ctrl"], key: "l" }}
            />
          </ActionPanel>
        }
      />
    );
  }

  const handleResolveAll = async () => {
    try {
      execJJ("resolve", repoPath);
      await showToast({
        title: "All conflicts resolved!",
        style: Toast.Style.Success
      });
    } catch (error) {
      await showToast({
        title: "Failed to resolve conflicts",
        message: error instanceof Error ? error.message : "Unknown error",
        style: Toast.Style.Failure
      });
    }
  };

  const handleResolveFile = async (file: string) => {
    try {
      execJJ(`resolve "${file}"`, repoPath);
      await showToast({
        title: `Resolved conflicts in ${file}`,
        style: Toast.Style.Success
      });
    } catch (error) {
      await showToast({
        title: `Failed to resolve ${file}`,
        message: error instanceof Error ? error.message : "Unknown error",
        style: Toast.Style.Failure
      });
    }
  };

  type ResolveItem = {
    title: string;
    subtitle: string;
    icon: string;
    description: string;
    file?: string;
  };

  const items: ResolveItem[] = [
    {
      title: "Resolve All Conflicts",
      subtitle: "Mark all conflicted files as resolved",
      icon: "✅",
      description: "Use this after manually editing all conflicted files to tell JJ the conflicts are resolved."
    }
  ];

  // Add individual file resolution options
  conflicts.forEach(file => {
    items.push({
      title: `Resolve ${file}`,
      subtitle: "Mark this file as resolved",
      icon: "📄",
      file: file,
      description: "Mark this specific file as resolved after editing conflicts."
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
          const fileToResolve = item.file;
          const resolveAction = fileToResolve ? () => handleResolveFile(fileToResolve) : handleResolveAll;
          return (
            <List.Item
              key={index}
              title={item.title}
              subtitle={item.subtitle}
              icon={item.icon}
              actions={
                <ActionPanel>
                  <Action
                    title={item.title}
                    onAction={resolveAction}
                    shortcut={index === 0 ? { modifiers: ["ctrl"], key: "enter" } : undefined}
                  />
                  <Action
                    title="Edit File"
                    onAction={() => showToast({ title: `Open ${fileName} in your editor` })}
                    shortcut={{ modifiers: ["ctrl"], key: "e" }}
                  />
                  <Action
                    title="View Diff"
                    onAction={launchDiff}
                    shortcut={{ modifiers: ["ctrl"], key: "d" }}
                  />
                  <Action
                    title="Check Status"
                    onAction={launchStatus}
                    shortcut={{ modifiers: ["ctrl"], key: "s" }}
                  />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
      <List.Section title="Help">
        <List.Item
          title="How to Resolve Conflicts"
          subtitle="Manual steps for conflict resolution"
          icon="❓"
          actions={
            <ActionPanel>
              <Action
                title="Show Help"
                onAction={() => showToast({
                  title: "Conflict Resolution Steps",
                  message: "1. Edit conflicted files manually\n2. Remove conflict markers\n3. Save files\n4. Run jj resolve"
                })}
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}