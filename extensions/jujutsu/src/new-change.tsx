import { Form, ActionPanel, Action, showToast, LaunchProps, useNavigation, Detail, Toast } from "@vicinae/api";
import { JJArguments } from "./utils/cli";
import { createNewChange } from "./utils/change";
import { RepoPathValidationErrorDetail } from "./components/validation";

export default function NewChange(props: LaunchProps<{ arguments: JJArguments }>) {
  const { "repo-path": repoPath } = props.arguments;
  const { push } = useNavigation();

  if (!repoPath) {
    return <RepoPathValidationErrorDetail />;
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