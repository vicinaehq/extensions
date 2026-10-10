import { Action, ActionPanel, Form, useNavigation } from "@vicinae/api";
import type { HistoryItem } from "../lib/types";

export function EditTitle(props: { item: HistoryItem; onEdit: (item: HistoryItem) => void }) {
  const { item } = props;
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            onSubmit={async (values) => {
              props.onEdit({ ...item, title: values.title ? String(values.title) : undefined });
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
