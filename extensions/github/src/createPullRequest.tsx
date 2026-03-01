import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Action, ActionPanel, Form } from "@vicinae/api";
import { useEffect } from "react";
import { useGetBranches } from "./hooks/useGetBranches";
import { useGetMyRepos } from "./hooks/useGetRepos";
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

  const { data: repos } = useGetMyRepos();
  const { data: branches = [] } = useGetBranches(repo);
  const { data: issues = [] } = useGetIssues(repo?.full_name || "");
  const { data: assignees = [] } = useGetAssignees(repo);

  useEffect(() => {
    if (repo) {
      const defaultBranch = branches?.find(
        (b) => b.name === repo.default_branch,
      );
      setToBranch(defaultBranch || null);
    }
  }, [repo, branches]);

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Submit PR" onSubmit={handleCreatePr} />
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
      <Form.Dropdown
        id="fromBranch"
        title="From"
        placeholder="Select a branch"
        error={errors?.fieldErrors.fromBranch?.[0]}
        value={fromBranch?.name || ""}
        onChange={(newValue) =>
          setFromBranch(branches?.find((b) => b.name === newValue) || null)
        }
      >
        {branches?.map((branch) => (
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
          setToBranch(branches?.find((b) => b.name === newValue) || null)
        }
      >
        {branches?.map((branch) => (
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
        title="PR Title"
        value={title}
        onChange={setTitle}
      />
      <Form.TextArea
        id="description"
        error={errors?.fieldErrors.description?.[0]}
        title="PR Description"
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
