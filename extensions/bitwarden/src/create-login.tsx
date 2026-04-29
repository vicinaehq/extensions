import { Form, ActionPanel, Action, showToast, Toast, popToRoot } from "@vicinae/api";
import { SessionProvider, useSession } from "./context/session-provider";
import { VaultProvider, useVault } from "./context/vault-provider";
import { ApiKeyLoginForm } from "./components/api-key-login-form";
import { UnlockForm } from "./components/unlock-form";

function Inner() {
  const { state, invalidateSession } = useSession();
  if (state.kind === "needs-login") return <ApiKeyLoginForm />;
  if (state.kind === "needs-unlock") return <UnlockForm />;
  if (state.kind !== "unlocked") return <Form />;
  return <VaultProvider vault={state.vault} onSessionInvalid={() => void invalidateSession()}><InnerForm /></VaultProvider>;
}

function InnerForm() {
  const { state } = useSession();
  const { folders } = useVault();
  if (state.kind !== "unlocked") return <Form />;
  const vault = state.vault;

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save"
            shortcut={{ modifiers: ["cmd"], key: "return" }}
            onSubmit={async (v) => {
              const name = String(v["name"] ?? "").trim();
              if (!name) return;
              const folderId = String(v["folderId"] ?? "_none_");
              try {
                await vault.createItem({
                  name,
                  username: String(v["username"] ?? "") || undefined,
                  password: String(v["password"] ?? "") || undefined,
                  uri: String(v["uri"] ?? "") || undefined,
                  folderId: folderId === "_none_" ? undefined : folderId,
                  notes: String(v["notes"] ?? "") || undefined,
                  totp: String(v["totp"] ?? "") || undefined,
                });
                await showToast({ style: Toast.Style.Success, title: "Login created" });
                await popToRoot();
              } catch (e) {
                await showToast({ style: Toast.Style.Failure, title: "Create failed", message: String(e) });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" autoFocus />
      <Form.TextField id="username" title="Username" />
      <Form.PasswordField id="password" title="Password" />
      <Form.TextField id="uri" title="URI" />
      <Form.TextField id="totp" title="TOTP secret" />
      <Form.Dropdown id="folderId" title="Folder" defaultValue="_none_">
        <Form.Dropdown.Item value="_none_" title="No Folder" />
        {folders.map((f) => f.id ? <Form.Dropdown.Item key={f.id} value={f.id} title={f.name} /> : null)}
      </Form.Dropdown>
      <Form.TextArea id="notes" title="Notes" />
    </Form>
  );
}

export default function CreateLogin() {
  return <SessionProvider><Inner /></SessionProvider>;
}
