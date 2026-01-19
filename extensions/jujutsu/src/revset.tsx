import { List, ActionPanel, Action, Icon, showToast, LaunchProps, useNavigation, Form, Toast, Clipboard } from "@vicinae/api";
import { execRevsetQuery } from "./utils/revset";
import { REVSET_PRESETS, JJArguments } from "./utils/cli";
import { JJChange } from "./utils/log";
import { RepoPathValidationError } from "./components/validation";

export default function JJRevsetCommand(props: LaunchProps<{ arguments: JJArguments }>) {
  const { "repo-path": repoPath } = props.arguments;
  const { push } = useNavigation();

  if (!repoPath) {
    return <RepoPathValidationError />;
  }

  const handleQuery = (values: Form.Values) => {
    const query = values.query as string;
    if (!query.trim()) {
      return;
    }

    try {
      const results = execRevsetQuery(query, repoPath);
      if (results.length === 0) {
        showToast({
          title: "No results",
          message: "No changes match the revset query",
          style: Toast.Style.Failure
        });
      } else {
        push(<RevsetResults repoPath={repoPath} query={query} results={results} />);
      }
    } catch (error) {
      showToast({
        title: "Invalid revset",
        message: error instanceof Error ? error.message : "Unknown error",
        style: Toast.Style.Failure
      });
    }
  };

  const openForm = () => {
    push(<RevsetForm onSubmit={handleQuery} />);
  };

  return (
    <List>
      <List.Section title="Common Revsets">
        {REVSET_PRESETS.map((preset) => (
          <List.Item
            key={preset.name}
            title={preset.name}
            subtitle={preset.description}
            icon={Icon.List}
            actions={
              <ActionPanel>
                <Action
                  title={`Query: ${preset.query}`}
                  onAction={() => push(<RevsetResults repoPath={repoPath} query={preset.query} results={execRevsetQuery(preset.query, repoPath)} />)}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      <List.Section title="Custom Query">
        <List.Item
          title="Enter Revset"
          subtitle="Click to open query form"
          icon={Icon.Terminal}
          actions={
            <ActionPanel>
              <Action
                title="Open Query Form"
                onAction={openForm}
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}

function RevsetForm({ onSubmit }: { onSubmit: (values: Form.Values) => void }) {

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Execute Query" onSubmit={onSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="query"
        title="Revset Expression"
      />
    </Form>
  );
}

function RevsetResults({ repoPath, query, results }: { repoPath: string; query: string; results: JJChange[] }) {
  return (
    <List>
      <List.Section title={`Results: ${query}`}>
        <List.Item
          title={`${results.length} changes found`}
          icon={Icon.CheckCircle}
        />
      </List.Section>
      {results.map((change) => (
        <List.Item
          key={change.change_id}
          title={change.description || "(no description)"}
          subtitle={`${change.author} - ${change.change_id.slice(0, 8)}`}
          icon={change.is_working_copy ? Icon.CircleFilled : Icon.Circle}
          accessories={
            change.bookmarks.length > 0
              ? [{ text: change.bookmarks.join(", "), icon: Icon.Tag }]
              : undefined
          }
          actions={
            <ActionPanel>
              <Action
                title="Copy Change ID"
                onAction={async () => {
                  await Clipboard.copy(change.change_id);
                  await showToast({ title: "Copied change ID!" });
                }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
