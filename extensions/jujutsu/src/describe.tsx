import { Form, ActionPanel, Action, showToast, LaunchProps, useNavigation, Detail, Toast } from "@vicinae/api";
import { JJArguments } from "./utils/cli";
import { describeChange, getCurrentDescription } from "./utils/change";
import { RepoPathValidationErrorDetail } from "./components/validation";

export default function DescribeChange(props: LaunchProps<{ arguments: JJArguments }>) {
  const { "repo-path": repoPath } = props.arguments;
  const { push } = useNavigation();

  if (!repoPath) {
    return <RepoPathValidationErrorDetail />;
  }

  const currentDescription = getCurrentDescription(repoPath);

  const handleSubmit = async (values: Form.Values) => {
    const description = (values.description as string) || "";
    describeChange(description, repoPath);
    await showToast({
      title: "Description updated",
      style: Toast.Style.Success,
    });
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Update Description"
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="description"
        title="Change Description"
        defaultValue={currentDescription}
      />
    </Form>
  );
}