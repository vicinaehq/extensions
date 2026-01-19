import { Form, ActionPanel, Action, showToast, LaunchProps, useNavigation, Detail, Toast } from "@vicinae/api";
import { createNewChange } from "./utils";
import { NavigationActions } from "./actions";

interface Arguments {
  "repo-path": string;
}

export default function NewChange(props: LaunchProps<{ arguments: Arguments }>) {
  const { "repo-path": repoPath } = props.arguments;
  const { push } = useNavigation();

  if (!repoPath) {
    const markdown = "# Error\n\nRepository path required. Provide a repository path as argument.";
    return <Detail markdown={markdown} />;
  }

  const handleSubmit = async (values: Form.Values) => {
    const description = values.description as string | undefined;
    createNewChange(description, repoPath);
    await showToast({
      title: "New change created",
      style: Toast.Style.Success,
    });
  };


  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Create New Change"
            onSubmit={handleSubmit}
          />
          {NavigationActions.createCrossNavigation(repoPath, push, "new-change")}
        </ActionPanel>
      }
    >
      <Form.TextField
        id="description"
        title="Change Description (optional)"
      />
    </Form>
  );
}