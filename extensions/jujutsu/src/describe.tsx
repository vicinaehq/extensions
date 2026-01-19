import { Form, ActionPanel, Action, showToast, LaunchProps, useNavigation, Detail, Toast } from "@vicinae/api";
import { describeChange, getCurrentDescription } from "./utils";
import { NavigationActions } from "./actions";

interface Arguments {
  "repo-path": string;
}

export default function DescribeChange(props: LaunchProps<{ arguments: Arguments }>) {
  const { "repo-path": repoPath } = props.arguments;
  const { push } = useNavigation();

  if (!repoPath) {
    const markdown = "# Error\n\nRepository path required. Provide a repository path as argument.";
    return <Detail markdown={markdown} />;
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
          {NavigationActions.createCrossNavigation(repoPath, push, "describe")}
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