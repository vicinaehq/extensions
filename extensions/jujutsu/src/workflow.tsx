import { List, ActionPanel, Action, Icon, showToast, LaunchProps, useNavigation, Color, Toast } from "@vicinae/api";
import { execJJ, getWorkingCopyPath, isJJRepo, executeWorkflow, createSyncWorkflow, createPullWorkflow, createPushWorkflow } from "./utils";
import { NavigationActions } from "./actions";

interface Arguments {
  "repo-path": string;
  workflow?: "pull-push" | "pull-only" | "push-only";
}

// Workflow component for handling sequences of JJ operations
export default function JJWorkflow(props: LaunchProps<{ arguments: Arguments }>) {
  const { "repo-path": repoPath, workflow = "pull-push" } = props.arguments;
  const { push, pop } = useNavigation();

  if (!repoPath) {
    return (
      <List>
        <List.Item
          title="Repository path required"
          subtitle="Provide a repository path as argument"
          icon={Icon.Warning}
          actions={
            <ActionPanel>
              <Action title="Back" onAction={pop} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const handlePullAndPush = async () => {
    const workflow = createSyncWorkflow(repoPath);
    await executeWorkflowWithUI(workflow, "Pull & Push");
  };

  const handlePullOnly = async () => {
    const workflow = createPullWorkflow(repoPath);
    await executeWorkflowWithUI(workflow, "Pull");
  };

  const handlePushOnly = async () => {
    const workflow = createPushWorkflow(repoPath);
    await executeWorkflowWithUI(workflow, "Push");
  };

  const executeWorkflowWithUI = async (steps: any[], workflowName: string) => {
    try {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await showToast({
          title: `Step ${i + 1}/${steps.length}: ${step.description}`,
          style: Toast.Style.Animated
        });

        const output = execJJ(step.command, step.cwd);
        await showToast({
          title: `Step ${i + 1}/${steps.length} completed`,
          message: step.description,
          style: Toast.Style.Success
        });

        // Brief pause between steps for better UX
        if (i < steps.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      await showToast({
        title: `${workflowName} workflow completed successfully`,
        style: Toast.Style.Success
      });

      // Navigate back after successful completion
      setTimeout(() => pop(), 1500);
    } catch (error: any) {
      await showToast({
        title: `${workflowName} workflow failed`,
        message: error.message || "Unknown error occurred",
        style: Toast.Style.Failure
      });
    }
  };

  const getWorkflowTitle = () => {
    switch (workflow) {
      case "pull-push": return "Pull & Push Workflow";
      case "pull-only": return "Pull Only Workflow";
      case "push-only": return "Push Only Workflow";
      default: return "JJ Workflow";
    }
  };

  const getWorkflowSubtitle = () => {
    switch (workflow) {
      case "pull-push": return "Pull latest changes and push local changes";
      case "pull-only": return "Pull latest changes from remote";
      case "push-only": return "Push local changes to remote";
      default: return "Execute JJ workflow operations";
    }
  };

  const getWorkflowIcon = () => {
    switch (workflow) {
      case "pull-push": return Icon.ArrowRightCircle;
      case "pull-only": return Icon.ArrowDownCircle;
      case "push-only": return Icon.ArrowUpCircle;
      default: return Icon.Gear;
    }
  };

  const getActionTitle = () => {
    switch (workflow) {
      case "pull-push": return "Start Pull & Push";
      case "pull-only": return "Start Pull";
      case "push-only": return "Start Push";
      default: return "Execute Workflow";
    }
  };

  return (
    <List>
      <List.Section title={getWorkflowTitle()}>
        <List.Item
          title={getWorkflowTitle()}
          subtitle={getWorkflowSubtitle()}
          icon={getWorkflowIcon()}
          accessories={[
            {
              text: workflow === "pull-push" ? "Sync" : workflow === "pull-only" ? "Pull" : "Push",
              icon: Icon.Dot
            }
          ]}
          actions={
            <ActionPanel>
              <Action
                title={getActionTitle()}
                onAction={
                  workflow === "pull-push" ? handlePullAndPush :
                  workflow === "pull-only" ? handlePullOnly :
                  handlePushOnly
                }
                shortcut={{ modifiers: ["ctrl"], key: "enter" }}
              />
              <Action
                title="Cancel"
                onAction={pop}
                shortcut={{ modifiers: ["ctrl"], key: "[" }}
              />
              {NavigationActions.createCrossNavigation(repoPath, push, "workflow")}
            </ActionPanel>
          }
        />

        {/* Workflow steps preview */}
        {workflow === "pull-push" && (
          <>
            <List.Item
              title="Step 1: Pull Changes"
              subtitle="Fetch latest changes from remote repositories"
              icon={Icon.ArrowDown}
              accessories={[{ text: "Pull", icon: Icon.Dot }]}
            />
            <List.Item
              title="Step 2: Push Changes"
              subtitle="Push local changes to remote repositories"
              icon={Icon.ArrowUp}
              accessories={[{ text: "Push", icon: Icon.Dot }]}
            />
          </>
        )}

        {workflow === "pull-only" && (
          <List.Item
            title="Pull Changes"
            subtitle="Fetch latest changes from remote repositories"
            icon={Icon.ArrowDown}
            accessories={[{ text: "Pull", icon: Icon.Dot }]}
          />
        )}

        {workflow === "push-only" && (
          <List.Item
            title="Push Changes"
            subtitle="Push local changes to remote repositories"
            icon={Icon.ArrowUp}
            accessories={[{ text: "Push", icon: Icon.Dot }]}
          />
        )}
      </List.Section>

      <List.Section title="Repository Info">
        <List.Item
          title="Repository Path"
          subtitle={repoPath}
          icon={Icon.Folder}
          actions={
            <ActionPanel>
              <Action
                title="Copy Path"
                onAction={async () => {
                  await showToast({ title: "Repository path copied!" });
                }}
                shortcut={{ modifiers: ["ctrl"], key: "c" }}
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}