import { Form, ActionPanel, Action } from "@vicinae/api";
import { useState } from "react";
import { Vault } from "../api/vault";
import { RbwCli } from "../api/rbw";
import { getPrefs, resolveCliPath, resolvePinentryShim } from "../utils/prefs";

export function RepromptForm({ onConfirmed, onCancel }: { onConfirmed: () => void; onCancel: () => void }) {
  const prefs = getPrefs();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  return (
    <Form
      isLoading={submitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Confirm"
            shortcut={{ modifiers: ["cmd"], key: "return" }}
            onSubmit={async (values) => {
              setSubmitting(true); setError(undefined);
              try {
                const master = String(values["master"] ?? "");
                const base = new RbwCli({ cliPath: resolveCliPath(prefs), serverCertsPath: prefs.serverCertsPath || undefined });
                const cliWithMP = base.withEnv({ RBW_PINENTRY_VALUE: master });
                const pinShim = resolvePinentryShim();
                let prior = "pinentry";
                try {
                  const cfg = await base.readJson<{ pinentry?: string | null }>(["config", "show"]);
                  const v = cfg?.pinentry?.trim();
                  if (v && v.length > 0) prior = v;
                } catch { /* fallback to "pinentry" */ }
                await cliWithMP.text(["config", "set", "pinentry", pinShim]);
                try {
                  await new Vault(cliWithMP).unlock(master);
                  onConfirmed();
                } finally {
                  try { await cliWithMP.text(["config", "set", "pinentry", prior]); } catch { /* best effort */ }
                }
              } catch {
                setError("Invalid master password");
              } finally {
                setSubmitting(false);
              }
            }}
          />
          <Action title="Cancel" onAction={onCancel} />
        </ActionPanel>
      }
    >
      <Form.Description text="This item requires master password reprompt." />
      <Form.PasswordField id="master" title="Master Password" error={error} autoFocus />
    </Form>
  );
}
