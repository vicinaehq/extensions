import { Action, ActionPanel, closeMainWindow, Icon, List, showToast } from "@vicinae/api";
import { WorkflowItem } from "./components/WorkflowItem";
import { useWorkflows } from "./hooks/use-workflows";

export default function FlowwWorkflows() {
  const { workflows, isLoading, error, setupStatus, refresh, applyWorkflow, showVersion } =
    useWorkflows();

  const handleApplyWorkflow = async (workflowName: string) => {
    try {
      await showToast({
        title: `Applying workflow: ${workflowName}`,
        message: "Launching workflow...",
      });

      await applyWorkflow(workflowName);
      await closeMainWindow();
    } catch (_err) {
      // Error is already handled in applyWorkflow function
    }
  };

  const handleInitFloww = async () => {
    try {
      await showToast({
        title: "Please run 'floww init' in terminal",
        message: "Initialize Floww configuration first",
      });
    } catch (_err) {
      // Handle error
    }
  };

  if (isLoading) {
    return (
      <List searchBarPlaceholder="Loading workflows...">
        <List.EmptyView
          title="Loading Workflows"
          description="Please wait while we load your workflows..."
          icon={Icon.Clock}
        />
      </List>
    );
  }

  if (error) {
    return (
      <List searchBarPlaceholder="Search workflows...">
        <List.EmptyView
          title="Error Loading Workflows"
          description={error}
          icon={Icon.ExclamationMark}
          actions={
            <ActionPanel>
              <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refresh} />
              <Action title="Show Version" icon={Icon.Info} onAction={showVersion} />
              {setupStatus && !setupStatus.installed && (
                <Action
                  title="Install Floww CLI"
                  icon={Icon.Download}
                  onAction={() => showToast({ title: "Please install Floww CLI first" })}
                />
              )}
              {setupStatus && !setupStatus.configExists && (
                <Action title="Initialize Floww" icon={Icon.Gear} onAction={handleInitFloww} />
              )}
            </ActionPanel>
          }
        />
      </List>
    );
  }

  if (workflows.length === 0) {
    return (
      <List searchBarPlaceholder="Search workflows...">
        <List.EmptyView
          title="No Workflows Found"
          description="Create some workflows using 'floww add' command"
          icon={Icon.Plus}
          actions={
            <ActionPanel>
              <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refresh} />
              <Action title="Show Version" icon={Icon.Info} onAction={showVersion} />
              <Action
                title="Add Workflow"
                icon={Icon.Plus}
                onAction={() => showToast({ title: "Use 'floww add' to create workflows" })}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List searchBarPlaceholder="Search workflows..." isShowingDetail={true}>
      <List.Section title={`Workflows (${workflows.length})`}>
        {workflows.map((workflow) => (
          <WorkflowItem
            key={workflow.name}
            workflow={workflow}
            onApply={handleApplyWorkflow}
            id={workflow.name}
          />
        ))}
      </List.Section>
    </List>
  );
}
