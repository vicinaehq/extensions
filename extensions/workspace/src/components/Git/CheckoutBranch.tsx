import { Action, ActionPanel, Icon, List, showToast, Toast, useNavigation } from "@vicinae/api";
import { useEffect } from "react";

import { useCachedPromise } from "@/hooks/useCachedPromise";

import { Project } from "@/types";
import { checkoutGitBranch, getLocalBranches } from "@/utils/git";

interface CheckoutBranchProps {
  onBranchChanged?: () => void;
  project: Project;
}

export default function CheckoutBranch({ onBranchChanged, project }: CheckoutBranchProps) {
  const { pop } = useNavigation();
  const currentBranch = project.gitStatus?.branch;

  const { data: branches, error, isLoading, revalidate } = useCachedPromise(getLocalBranches, [project.fullPath]);

  useEffect(() => {
    if (!error || isLoading || !branches?.length) {
      return;
    }

    void showToast({ message: error.message, style: Toast.Style.Failure, title: "Couldn't load branches" });
  }, [branches, error, isLoading]);

  const handleCheckout = async (branch: string) => {
    if (branch === currentBranch) {
      await showToast({ style: Toast.Style.Failure, title: "Already on this branch" });
      return;
    }

    const toast = await showToast({ style: Toast.Style.Animated, title: `Checking out ${branch}...` });
    const success = await checkoutGitBranch(project.fullPath, branch);

    if (success) {
      toast.style = Toast.Style.Success;
      toast.title = `Checked out ${branch}`;
      if (onBranchChanged) onBranchChanged();
      pop();
    } else {
      toast.style = Toast.Style.Failure;
      toast.title = "Checkout failed";
      toast.message = "Check for uncommitted changes.";
    }
  };

  return (
    <List
      isLoading={isLoading}
      navigationTitle={`Checkout Branch - ${project.name}`}
      searchBarPlaceholder="Search branches..."
    >
      {error && !isLoading && !branches?.length && (
        <List.EmptyView
          actions={
            <ActionPanel>
              <Action icon={Icon.ArrowClockwise} onAction={revalidate} title="Retry" />
            </ActionPanel>
          }
          description={error.message}
          title="Couldn't Load Branches"
        />
      )}
      {(branches ?? []).map((branch) => {
        const isCurrent = branch === currentBranch;
        return (
          <List.Item
            accessories={isCurrent ? [{ icon: Icon.CheckCircle, tooltip: "Current Branch" }] : undefined}
            actions={
              <ActionPanel>
                {!isCurrent && (
                  <Action icon={Icon.ArrowRight} onAction={() => handleCheckout(branch)} title="Checkout Branch" />
                )}
                <Action.CopyToClipboard content={branch} title="Copy Branch Name" />
              </ActionPanel>
            }
            icon={Icon.Shuffle}
            key={branch}
            title={branch}
          />
        );
      })}
    </List>
  );
}
