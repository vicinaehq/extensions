import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Action, ActionPanel, Form } from "@vicinae/api";
import { useEffect } from "react";
import { useGetBranches } from "./hooks/useGetBranches";
import { useGetMyRepos } from "./hooks/useGetRepos";
import { useGetRepositoryDetails } from "./hooks/useGetRepositoryDetails";
import { usePullRequestForm } from "./hooks/usePullRequestForm";
import { persister, queryClient } from "./queryClient";
import { useGetIssues } from "./hooks/useGetIssues";
import { useGetAssignees } from "./hooks/useGetAssignees";

function CreatePullRequest() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
    >
      <Command />
    </PersistQueryClientProvider>
  );
}

function Command() {
  const {
    repo,
    setRepo,
    baseRepo,
    setBaseRepo,
    fromBranch,
    setFromBranch,
    toBranch,
    setToBranch,
    description,
    setDescription,
    linkedIssue,
    setLinkedIssue,
    autoClose,
    setAutoClose,
    setTitle,
    title,
    handleCreatePr,
    assignee,
    setAssignee,
    draft,
    setDraft,
    errors,
  } = usePullRequestForm();

  const { data: repos = [] } = useGetMyRepos();
  const { data: repoDetails } = useGetRepositoryDetails(repo);
  const defaultBaseRepo =
    repoDetails?.fork && repoDetails.parent ? repoDetails.parent : repo;
  const effectiveBaseRepo = baseRepo || defaultBaseRepo || null;
  const { data: sourceBranches = [] } = useGetBranches(repo);
  const { data: targetBranches = [] } = useGetBranches(effectiveBaseRepo);
  const { data: issues = [] } = useGetIssues(
    effectiveBaseRepo?.full_name || "",
  );
  const { data: assignees = [] } = useGetAssignees(effectiveBaseRepo);
  const isForkRepo = Boolean(repoDetails?.fork && repoDetails.parent);

  const baseRepoOptions = [repoDetails?.parent, repo].filter(
    (x) => x !== undefined && x !== null,
  );

  useEffect(() => {
    if (effectiveBaseRepo) {
      const defaultBranch = targetBranches?.find(
        (b) => b.name === effectiveBaseRepo.default_branch,
      );
      setToBranch(defaultBranch || null);
    }
  }, [effectiveBaseRepo, targetBranches, setToBranch]);

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Submit PR"
            onSubmit={() => handleCreatePr(effectiveBaseRepo)}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="repository"
        title="Repository"
        placeholder="Select a repository"
        error={errors?.fieldErrors.repo?.[0]}
        value={repo?.full_name || ""}
        onChange={(newValue) =>
          setRepo(repos?.find((r) => r.full_name === newValue) || null)
        }
      >
        {repos?.map((repo) => (
          <Form.Dropdown.Item
            key={repo.id}
            value={repo.full_name}
            icon={repo?.owner?.avatar_url}
            title={repo.name}
          />
        ))}
      </Form.Dropdown>
      {isForkRepo && (
        <Form.Dropdown
          id="baseRepository"
          title="Base Repository"
          placeholder="Select a target repository"
          error={errors?.fieldErrors.baseRepo?.[0]}
          value={effectiveBaseRepo?.full_name || ""}
          onChange={(newValue) =>
            setBaseRepo(
              baseRepoOptions.find(
                (repoOption) => repoOption.full_name === newValue,
              ) || null,
            )
          }
        >
          {baseRepoOptions.map((baseRepoOption) => (
            <Form.Dropdown.Item
              key={baseRepoOption.id}
              value={baseRepoOption.full_name}
              icon={baseRepoOption?.owner?.avatar_url}
              title={baseRepoOption.name}
            />
          ))}
        </Form.Dropdown>
      )}
      <Form.Dropdown
        id="fromBranch"
        title="From"
        placeholder="Select a branch"
        error={errors?.fieldErrors.fromBranch?.[0]}
        value={fromBranch?.name || ""}
        onChange={(newValue) =>
          setFromBranch(
            sourceBranches?.find((branch) => branch.name === newValue) || null,
          )
        }
      >
        {sourceBranches?.map((branch) => (
          <Form.Dropdown.Item
            key={branch.name}
            value={branch.name}
            title={branch.name}
          />
        ))}
      </Form.Dropdown>
      <Form.Dropdown
        id="toBranch"
        title="Into"
        placeholder="Select a branch"
        error={errors?.fieldErrors.toBranch?.[0]}
        value={toBranch?.name}
        onChange={(newValue) =>
          setToBranch(
            targetBranches?.find((branch) => branch.name === newValue) || null,
          )
        }
      >
        {targetBranches?.map((branch) => (
          <Form.Dropdown.Item
            key={branch.name}
            value={branch.name}
            title={branch.name}
          />
        ))}
      </Form.Dropdown>
      <Form.Checkbox
        id="draft"
        label="As draft"
        value={draft}
        onChange={setDraft}
      />
      <Form.Separator />
      <Form.TextField
        id="title"
        error={errors?.fieldErrors.title?.[0]}
        placeholder="PR title"
        title="Title"
        value={title}
        onChange={setTitle}
      />
      <Form.TextArea
        id="description"
        error={errors?.fieldErrors.description?.[0]}
        placeholder="PR description (e.g **bold**)..."
        title="Description"
        value={description}
        onChange={setDescription}
      />
      <Form.Dropdown
        id="assignee"
        title="Assignee"
        placeholder="Select an assignee"
        error={errors?.fieldErrors.assignee?.[0]}
        value={assignee?.login || ""}
        onChange={(newValue) =>
          setAssignee(assignees?.find((a) => a.login === newValue) || null)
        }
      >
        {assignees?.map((assignee) => (
          <Form.Dropdown.Item
            key={assignee.login}
            value={assignee.login}
            title={assignee.login}
          />
        ))}
      </Form.Dropdown>
      <Form.Dropdown
        id="linkedIssue"
        title="Linked Issue"
        placeholder="Select an issue"
        error={errors?.fieldErrors.linkedIssue?.[0]}
        value={linkedIssue?.id.toString() || ""}
        onChange={(newValue) =>
          setLinkedIssue(
            issues?.find((b) => b.id.toString() === newValue) || null,
          )
        }
      >
        {issues?.map((issue) => (
          <Form.Dropdown.Item
            key={issue.id}
            value={issue.id.toString()}
            title={issue.title}
          />
        ))}
      </Form.Dropdown>
      <Form.Checkbox
        id="autoClose"
        label="Auto-close linked issue"
        value={autoClose}
        onChange={setAutoClose}
      />
    </Form>
  );
}

export default CreatePullRequest;
