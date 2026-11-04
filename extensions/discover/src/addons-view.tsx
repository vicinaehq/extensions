import { useState } from "react";
import {
  Action,
  ActionPanel,
  Detail,
  Form,
  Icon,
  List,
  closeMainWindow,
  useNavigation,
} from "@vicinae/api";
import { spawn } from "node:child_process";
import {
  addonStores,
  installedAddons,
  localPlan,
  removeAddonPlan,
  plasmaTypes,
} from "./lib/plasma";
import { binary } from "./lib/system";
import { PlanAction, PlanView, report } from "./ui";

export function AddonsView() {
  const [, setRevision] = useState(0);
  const stores = addonStores(),
    addons = installedAddons();
  return (
    <List
      navigationTitle="Plasma Add-ons"
      searchBarPlaceholder="Search themes, widgets or KWin add-ons…"
    >
      <List.Section
        title="KDE stores"
        subtitle="Installation and updates open in the KDE store window"
      >
        {stores.map((store) => (
          <List.Item
            key={store.id}
            title={store.title}
            subtitle={store.id}
            icon={Icon.Stars}
            actions={
              <ActionPanel>
                <Action
                  title="Open KDE Store"
                  icon={Icon.Globe01}
                  onAction={() =>
                    void report(async () => {
                      const file = binary("knewstuff-dialog6");
                      if (!file) throw new Error("knewstuff-dialog6 was not found.");
                      const c = spawn(file, [store.file], { stdio: "ignore", detached: true });
                      await new Promise<void>((resolve, reject) => {
                        c.once("error", reject);
                        c.once("spawn", () => {
                          c.unref();
                          resolve();
                        });
                      });
                      await closeMainWindow();
                    })
                  }
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      <List.Section title="Installed Plasma packages" subtitle={String(addons.length)}>
        {addons.map((addon) => (
          <List.Item
            key={addon.type + addon.id}
            title={addon.title}
            subtitle={addon.description}
            icon={Icon.AppWindow}
            accessories={[{ text: addon.version }, { tag: addon.user ? "User" : "System" }]}
            actions={
              <ActionPanel>
                <Action.Push
                  title="View Details"
                  target={
                    <Detail
                      markdown={`# ${addon.title}\n\n${addon.description}\n\nType: ${addon.type}\n\nID: ${addon.id}\n\nLocation: ${addon.path}`}
                    />
                  }
                />
                {addon.user && (
                  <PlanAction
                    title="Remove Add-on"
                    make={() => removeAddonPlan(addon)}
                    destructive
                  />
                )}
                <Action.ShowInFinder title="Show Files" path={addon.path} />
                <Action title="Refresh" onAction={() => setRevision((x) => x + 1)} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      {!stores.length && !addons.length && (
        <List.EmptyView
          title="Plasma add-on infrastructure not found"
          description="KDE Plasma and KNewStuff components are required."
        />
      )}
    </List>
  );
}
export function LocalInstallView() {
  const { push } = useNavigation();
  const [type, setType] = useState("pacman"),
    [busy, setBusy] = useState(false);
  return (
    <Form
      navigationTitle="Install from File"
      isLoading={busy}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Review Installation"
            onSubmit={async (values) => {
              const files = values.files as string[];
              if (!files?.length) {
                void report(async () => {
                  throw new Error("Select a package file.");
                });
                return;
              }
              if (busy) return;
              setBusy(true);
              await report(async () => {
                try {
                  push(
                    <PlanView
                      plan={await localPlan(
                        files[0],
                        type,
                        values.scope === "system" ? "system" : "user",
                        type === "plasma"
                          ? String(values.plasmaType)
                          : String(values.sourceName || ""),
                      )}
                    />,
                  );
                } finally {
                  setBusy(false);
                }
              });
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="type" title="Package Type" value={type} onChange={setType}>
        <Form.Dropdown.Item title="System Package · .pkg.tar.zst" value="pacman" />
        <Form.Dropdown.Item
          title="Flatpak · .flatpak / .flatpakref / .flatpakrepo"
          value="flatpak"
        />
        <Form.Dropdown.Item title="Plasma Package" value="plasma" />
      </Form.Dropdown>
      <Form.FilePicker
        id="files"
        title="Package File"
        allowMultipleSelection={false}
        canChooseDirectories={type === "plasma"}
        canChooseFiles
      />
      {type === "flatpak" && (
        <>
          <Form.Dropdown id="scope" title="Scope" defaultValue="user">
            <Form.Dropdown.Item title="User" value="user" />
            <Form.Dropdown.Item title="System" value="system" />
          </Form.Dropdown>
          <Form.TextField
            id="sourceName"
            title="Source Name"
            info="Required only for .flatpakrepo files."
          />
        </>
      )}
      {type === "plasma" && (
        <Form.Dropdown id="plasmaType" title="Plasma Package Type" defaultValue="Plasma/Applet">
          {plasmaTypes.map((p) => (
            <Form.Dropdown.Item key={p} title={p} value={p} />
          ))}
        </Form.Dropdown>
      )}
      <Form.Description text="Review the installation before starting. System packages use Polkit authentication." />
    </Form>
  );
}
