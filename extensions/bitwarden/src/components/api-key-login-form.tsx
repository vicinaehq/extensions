import { Form, ActionPanel, Action } from "@vicinae/api";
import { useState } from "react";
import { useSession } from "../context/session-provider";
import { getPrefs } from "../utils/prefs";

export function ApiKeyLoginForm() {
  const prefs = getPrefs();
  const { loginApiKey } = useSession();
  const [submitting, setSubmitting] = useState(false);

  return (
    <Form
      isLoading={submitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Log in"
            shortcut={{ modifiers: ["cmd"], key: "return" }}
            onSubmit={async (values) => {
              setSubmitting(true);
              try {
                await loginApiKey(
                  String(values["email"] ?? ""),
                  String(values["clientId"] ?? ""),
                  String(values["clientSecret"] ?? ""),
                  String(values["master"] ?? ""),
                );
              } catch { /* toast handled in provider */ }
              finally { setSubmitting(false); }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Log in to Bitwarden via rbw. The API key registers this device; the master password unlocks the vault." />
      <Form.TextField id="email" title="Email" />
      <Form.PasswordField id="clientId" title="API Client ID" defaultValue={prefs.clientId} />
      <Form.PasswordField id="clientSecret" title="API Client Secret" defaultValue={prefs.clientSecret} />
      <Form.PasswordField id="master" title="Master Password" />
    </Form>
  );
}
