import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Form,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import { clearBackends, getBackends, removeBackend, saveBackend } from "../lib/backends";
import { requestBackend } from "../lib/clash-api";
import { showError } from "../lib/toast";
import type { Backend } from "../types";

function BackendForm({ backend, onSaved }: { backend?: Backend; onSaved: () => void }) {
  const { pop } = useNavigation();
  const [isLoading, setIsLoading] = useState(false);

  async function submit(values: Form.Values) {
    const name = String(values.name ?? "");
    const url = String(values.url ?? "");
    const secret = String(values.secret ?? "");
    setIsLoading(true);
    let savedBackend: Backend;
    try {
      savedBackend = await saveBackend(name, url, secret, backend?.id);
    } catch (error) {
      await showError("Could Not Save Backend", error);
      setIsLoading(false);
      return;
    }

    try {
      await requestBackend<unknown>(savedBackend, "/version");
      await showToast({ style: Toast.Style.Success, title: "Backend Saved", message: savedBackend.name });
    } catch (error) {
      await showError("Backend Saved, but Connection Test Failed", error);
    } finally {
      setIsLoading(false);
    }
    onSaved();
    pop();
  }

  return (
    <Form
      isLoading={isLoading}
      navigationTitle={backend ? "Edit Clash Backend" : "Add Clash Backend"}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Backend" icon={backend ? Icon.Pencil : Icon.Plus} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Name"
        placeholder="Home"
        defaultValue={backend?.name ?? ""}
        autoFocus={!backend}
      />
      <Form.TextField
        id="url"
        title="Controller URL"
        placeholder="http://127.0.0.1:9090"
        defaultValue={backend?.url ?? "http://127.0.0.1:9090"}
      />
      <Form.PasswordField id="secret" title="Secret" placeholder="Optional" defaultValue={backend?.secret ?? ""} />
    </Form>
  );
}

export default function Backends() {
  const [backends, setBackends] = useState<Backend[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setBackends(await getBackends());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  async function deleteBackend(backend: Backend) {
    if (
      !(await confirmAlert({
        title: "Remove this backend?",
        message: `${backend.name} (${backend.url})`,
        primaryAction: { title: "Remove", style: Alert.ActionStyle.Destructive },
      }))
    )
      return;
    await removeBackend(backend.id);
    await load();
  }

  async function deleteAll() {
    if (
      !(await confirmAlert({
        title: "Remove all Clash backends?",
        message: "This removes all saved controller URLs and secrets.",
        primaryAction: { title: "Remove All", style: Alert.ActionStyle.Destructive },
      }))
    )
      return;
    await clearBackends();
    await load();
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search Clash backends...">
      {backends.map((backend) => (
        <List.Item
          key={backend.id}
          icon={Icon.HardDrive}
          title={backend.name}
          subtitle={backend.url}
          keywords={[backend.url, backend.secret ? "Authenticated" : "No secret"]}
          accessories={backend.secret ? [{ text: "Authenticated" }] : [{ text: "No secret" }]}
          actions={
            <ActionPanel>
              <Action
                title="Test Connection"
                icon={Icon.Bolt}
                onAction={async () => {
                  try {
                    await requestBackend<unknown>(backend, "/version");
                    await showToast({
                      style: Toast.Style.Success,
                      title: "Connection Successful",
                      message: backend.name,
                    });
                  } catch (error) {
                    await showError("Connection Failed", error);
                  }
                }}
              />
              <Action.Push
                title="Edit Backend"
                icon={Icon.Pencil}
                target={<BackendForm backend={backend} onSaved={() => void load()} />}
              />
              <Action
                title="Remove Backend"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                onAction={() => void deleteBackend(backend)}
              />
            </ActionPanel>
          }
        />
      ))}
      <List.Item
        icon={{ source: Icon.Plus, tintColor: Color.Blue }}
        title="Add Backend"
        actions={
          <ActionPanel>
            <Action.Push title="Add Backend" icon={Icon.Plus} target={<BackendForm onSaved={() => void load()} />} />
          </ActionPanel>
        }
      />
      {backends.length > 0 ? (
        <List.Item
          icon={{ source: Icon.Trash, tintColor: Color.Red }}
          title="Remove All Backends"
          actions={
            <ActionPanel>
              <Action
                title="Remove All Backends"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                onAction={() => void deleteAll()}
              />
            </ActionPanel>
          }
        />
      ) : null}
    </List>
  );
}
