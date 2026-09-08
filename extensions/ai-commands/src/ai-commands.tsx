import {
  Action,
  ActionPanel,
  Alert,
  Detail,
  Icon,
  List,
  confirmAlert,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { HARNESS_NAMES, errorMessage, type AICommand } from "./core/types";
import { launcherEnabled } from "./core/launcher-paths";
import {
  captureSource,
  deleteCommand,
  publishCommand,
  repository,
  synchronizeMainSearch,
  toastError,
  type SourceContext,
} from "./vicinae";
import { CommandForm, LAUNCHER_SETUP_URL } from "./ui/command-form";
import { RunView } from "./ui/run-view";

export default function AICommands() {
  const rootSearchReady = process.platform === "linux" && launcherEnabled();
  const [commands, setCommands] = useState<AICommand[]>([]);
  const [context, setContext] = useState<SourceContext>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const reload = async () => {
    setCommands(await repository.commands());
  };
  useEffect(() => {
    let active = true;
    void Promise.all([repository.commands(), captureSource()])
      .then(async ([saved, source]) => {
        await synchronizeMainSearch(saved).catch((failure) =>
          toastError(failure, "Some main-search entries need repair"),
        );
        if (active) {
          setCommands(saved);
          setContext(source);
        }
      })
      .catch((error) => {
        if (active) setError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  if (error) return <Detail markdown={error} />;
  return (
    <List
      navigationTitle="AI Commands"
      searchBarPlaceholder="Find an AI command…"
      isLoading={loading}
      actions={
        <ActionPanel>
          <Action.Push
            title="Create AI Command"
            icon={Icon.Plus}
            target={
              <CommandForm onSave={() => void reload().catch(toastError)} />
            }
          />
        </ActionPanel>
      }
    >
      <List.EmptyView
        title={loading ? "Loading commands…" : "Create your first AI command"}
        description="Save a prompt, choose a model, and transform selected text."
        icon={Icon.Stars}
      />
      {commands.map((command) => (
        <List.Item
          key={command.id}
          id={command.id}
          title={command.name}
          icon={Icon.Stars}
          subtitle={HARNESS_NAMES[command.harness]}
          accessories={[{ text: command.model }]}
          actions={
            <ActionPanel>
              {context && (
                <Action.Push
                  title="Run Command"
                  icon={Icon.Play}
                  target={<RunView command={command} context={context} />}
                />
              )}
              <Action.Push
                title="Edit Command"
                icon={Icon.Pencil}
                shortcut={{ modifiers: ["ctrl"], key: "e" }}
                target={
                  <CommandForm
                    command={command}
                    onSave={() => void reload().catch(toastError)}
                  />
                }
              />
              {rootSearchReady ? (
                <Action
                  title="Repair Main Search Entry"
                  icon={Icon.ArrowClockwise}
                  onAction={() =>
                    void publishCommand(command).catch(toastError)
                  }
                />
              ) : (
                <Action.OpenInBrowser
                  title="Root Search Setup Instructions"
                  url={LAUNCHER_SETUP_URL}
                />
              )}
              <Action.Push
                title="Duplicate Command"
                icon={Icon.Duplicate}
                target={
                  <CommandForm
                    command={command}
                    duplicate
                    onSave={() => void reload().catch(toastError)}
                  />
                }
              />
              <Action.Push
                title="Create AI Command"
                icon={Icon.Plus}
                shortcut={{ modifiers: ["ctrl"], key: "n" }}
                target={
                  <CommandForm onSave={() => void reload().catch(toastError)} />
                }
              />
              <Action
                title="Delete Command"
                icon={Icon.Trash}
                style="destructive"
                onAction={() =>
                  void (async () => {
                    if (
                      await confirmAlert({
                        title: `Delete “${command.name}”?`,
                        message:
                          "The command and its automatic main-search entry will be removed.",
                        primaryAction: {
                          title: "Delete",
                          style: Alert.ActionStyle.Destructive,
                        },
                      })
                    ) {
                      await deleteCommand(command);
                      await reload();
                    }
                  })().catch(toastError)
                }
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
