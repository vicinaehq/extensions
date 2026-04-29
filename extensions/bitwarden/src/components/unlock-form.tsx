import { Form, ActionPanel, Action } from "@vicinae/api";
import { useState } from "react";
import { useSession } from "../context/session-provider";

export function UnlockForm() {
  const { unlock } = useSession();
  const [submitting, setSubmitting] = useState(false);
  return (
    <Form
      isLoading={submitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Unlock"
            shortcut={{ modifiers: ["cmd"], key: "return" }}
            onSubmit={async (values) => {
              setSubmitting(true);
              try { await unlock(String(values["master"] ?? "")); }
              catch { /* toast handled in provider */ }
              finally { setSubmitting(false); }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.PasswordField id="master" title="Master Password" autoFocus />
    </Form>
  );
}
