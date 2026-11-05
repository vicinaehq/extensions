import { useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Form,
  Icon,
  Toast,
  showToast,
  popToRoot,
} from "@vicinae/api";
import { SnapperConfig, createSnapshot, hasAccess, listConfigs } from "./lib/snapper";
import { AccessGate, ErrorView } from "./browse-snapshots";

export default function CreateSnapshot() {
  const [configs, setConfigs] = useState<SnapperConfig[]>([]);
  const [access, setAccess] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const ok = await hasAccess();
      setAccess(ok);
      if (ok) setConfigs(await listConfigs());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error) return <ErrorView message={error} />;
  if (access === false) return <AccessGate onDone={load} />;

  return (
    <Form
      isLoading={loading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Create Snapshot"
            icon={Icon.Plus}
            onSubmit={(values: Form.Values) =>
              submit(values.config as string, (values.description as string) || "")
            }
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="config" title="Config">
        {configs.map((c) => (
          <Form.Dropdown.Item key={c.config} value={c.config} title={`${c.config} (${c.subvolume})`} />
        ))}
      </Form.Dropdown>
      <Form.TextField id="description" title="Description" placeholder="e.g. before system update" />
    </Form>
  );
}

async function submit(config: string, description: string) {
  const toast = await showToast({ style: Toast.Style.Animated, title: "Creating snapshot…" });
  try {
    await createSnapshot(config, description);
    toast.style = Toast.Style.Success;
    toast.title = "Snapshot created";
    await popToRoot();
  } catch (e) {
    toast.style = Toast.Style.Failure;
    toast.title = "Could not create snapshot";
    toast.message = e instanceof Error ? e.message : String(e);
  }
}
