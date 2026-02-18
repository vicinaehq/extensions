import { Action, ActionPanel, Form, useNavigation } from "@vicinae/api";
import { HistoryItem } from "@/types";

export function EditTitle(props: { item: HistoryItem; onEdit: (item: HistoryItem) => Promise<void> }) {
  const { item } = props;
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            onSubmit={async (values) => {
              await props.onEdit({ ...item, title: values.title });
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="title" title="Title" defaultValue={item.title} placeholder="Brand Color" />
    </Form>
  );
}
