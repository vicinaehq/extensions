import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Action, ActionPanel, Form } from "@vicinae/api";
import { useGetAssignees } from "./hooks/useGetAssignees";
import { useGetLabels } from "./hooks/useGetLabels";
import { useGetMyRepos } from "./hooks/useGetRepos";
import { useIssueForm } from "./hooks/useIssueForm";
import { persister, queryClient } from "./queryClient";

function CreateIssue() {
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
    assignee,
    description,
    label,
    setAssignee,
    setDescription,
    setLabel,
    setTitle,
    title,
    handleCreateIssue,
    errors,
  } = useIssueForm();
  const { data: repos } = useGetMyRepos();
  const { data: assignees } = useGetAssignees(repo);
  const { data: labels } = useGetLabels(repo);
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Submit Issue"
            onSubmit={handleCreateIssue}
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
      <Form.Separator />
      <Form.TextField
        id="title"
        error={errors?.fieldErrors.title?.[0]}
        title="Title"
        placeholder="Enter issue title..."
        value={title}
        onChange={setTitle}
      />
      <Form.TextArea
        id="description"
        error={errors?.fieldErrors.description?.[0]}
        placeholder="Issue description (e.g **bold**)..."
        title="Description"
        value={description}
        onChange={setDescription}
      />
      <Form.Dropdown
        id="assignee"
        error={errors?.fieldErrors.assignee?.[0]}
        title="Assignee"
        placeholder="Select an assignee"
        value={assignee?.login || ""}
        onChange={(newValue) =>
          setAssignee(assignees?.find((a) => a.login === newValue) || null)
        }
      >
        {assignees?.map((assignee) => (
          <Form.Dropdown.Item
            key={assignee.id}
            value={assignee.login}
            title={assignee.login}
            icon={assignee.avatar_url}
          />
        ))}
      </Form.Dropdown>
      <Form.Dropdown
        id="labels"
        error={errors?.fieldErrors.label?.[0]}
        title="Labels"
        placeholder="Select an label"
        value={label?.name || ""}
        onChange={(newValue) =>
          setLabel(labels?.find((l) => l.name === newValue) || null)
        }
      >
        {labels?.map((label) => (
          <Form.Dropdown.Item
            key={label.id}
            value={label.name}
            title={label.name}
            icon={{ source: label.url, tintColor: `#${label.color}` }}
          />
        ))}
      </Form.Dropdown>
    </Form>
  );
}

export default CreateIssue;
