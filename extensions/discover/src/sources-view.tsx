import { useState } from "react";
import { Action, ActionPanel, Detail, Form, Icon, List, useNavigation } from "@vicinae/api";
import { sources } from "./lib/catalog";
import { binary } from "./lib/system";
import { addFlatpakSource, flatpakSourcePlan } from "./lib/flatpak";
import { firmwareSourcePlan } from "./lib/firmware";
import { labels, useLoad, Warnings, PlanAction, PlanView } from "./ui";
import type { Source } from "./lib/types";

export function SourcesView() {
  const [revision, setRevision] = useState(0);
  const { value, loading, error } = useLoad(sources, [revision], {
    items: [] as Source[],
    warnings: [] as string[],
  });
  return (
    <List
      navigationTitle="Software Sources"
      isLoading={loading}
      searchBarPlaceholder="Search sources…"
    >
      <List.Section title="Manage sources">
        {binary("flatpak") && (
          <List.Item
            title="Add Flatpak Source"
            icon={Icon.Plus}
            actions={
              <ActionPanel>
                <Action.Push title="Add Source" target={<AddSourceForm />} />
              </ActionPanel>
            }
          />
        )}
        {binary("pacman") && (
          <List.Item
            title="Edit System Repositories"
            subtitle="pacman.conf · repository and mirror priorities"
            icon={Icon.Text}
            actions={
              <ActionPanel>
                <Action.RunInTerminal
                  title="Edit Repository Configuration"
                  args={["sudoedit", "/etc/pacman.conf"]}
                />
                <Action.Open title="View Configuration" target="/etc/pacman.conf" />
              </ActionPanel>
            }
          />
        )}
        <List.Item
          title="Refresh Sources"
          icon={Icon.ArrowClockwise}
          actions={
            <ActionPanel>
              <Action title="Refresh" onAction={() => setRevision((x) => x + 1)} />
            </ActionPanel>
          }
        />
      </List.Section>
      {value.items.map((source) => (
        <List.Item
          key={source.id}
          title={source.title}
          subtitle={source.description}
          icon={Icon.Globe01}
          accessories={[
            { tag: labels[source.backend] },
            { text: source.scope || "" },
            { tag: source.enabled ? "Enabled" : "Disabled" },
          ]}
          actions={
            <ActionPanel>
              <Action.Push
                title="View Source Information"
                target={
                  <Detail
                    markdown={`# ${source.title}\n\n${source.description || ""}\n\n${source.url
                      .split("\n")
                      .map((x) => "- " + x)
                      .join("\n")}`}
                  />
                }
              />
              {source.backend === "flatpak" && (
                <>
                  <PlanAction
                    title={source.enabled ? "Disable" : "Enable"}
                    make={() => flatpakSourcePlan(source, source.enabled ? "disable" : "enable")}
                  />
                  <PlanAction
                    title="Remove Source"
                    make={() => flatpakSourcePlan(source, "remove")}
                    destructive
                  />
                </>
              )}
              {source.backend === "fwupd" && (
                <PlanAction
                  title={source.enabled ? "Disable" : "Enable"}
                  make={() => firmwareSourcePlan(source)}
                />
              )}
              <Action.CopyToClipboard title="Copy Address" content={source.url} />
              <Action title="Refresh List" onAction={() => setRevision((x) => x + 1)} />
            </ActionPanel>
          }
        />
      ))}
      <Warnings warnings={[...value.warnings, ...(error ? [error] : [])]} />
    </List>
  );
}
function AddSourceForm() {
  const { push } = useNavigation();
  const [error, setError] = useState("");
  return (
    <Form
      navigationTitle="Add Flatpak Source"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Review Source"
            onSubmit={(values) => {
              try {
                const plan = addFlatpakSource(
                  String(values.name),
                  String(values.url),
                  values.scope === "system" ? "system" : "user",
                );
                setError("");
                push(<PlanView plan={plan} />);
              } catch (e) {
                setError(String(e));
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Source Name" placeholder="flathub" />
      <Form.TextField
        id="url"
        title="Repository URL"
        placeholder="https://dl.flathub.org/repo/flathub.flatpakrepo"
        error={error}
      />
      <Form.Dropdown id="scope" title="Scope" defaultValue="user">
        <Form.Dropdown.Item title="User" value="user" />
        <Form.Dropdown.Item title="System" value="system" />
      </Form.Dropdown>
    </Form>
  );
}
