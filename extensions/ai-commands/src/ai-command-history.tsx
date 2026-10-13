import {
  Action,
  ActionPanel,
  Alert,
  Detail,
  Icon,
  List,
  confirmAlert,
  useNavigation,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { errorMessage, type HistoryEntry } from "./core/types";
import { plainTextMarkdown } from "./core/template";
import {
  captureSource,
  pasteToSource,
  repository,
  toastError,
  type SourceContext,
} from "./vicinae";

export default function AICommandHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [context, setContext] = useState<SourceContext>();
  const { push } = useNavigation();
  useEffect(() => {
    let active = true;
    void Promise.all([repository.history(), captureSource()])
      .then(([entries, source]) => {
        if (active) {
          setHistory(entries);
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
  const clear = () =>
    void (async () => {
      if (
        await confirmAlert({
          title: "Clear AI command history?",
          primaryAction: {
            title: "Clear History",
            style: Alert.ActionStyle.Destructive,
          },
        })
      ) {
        await repository.clearHistory();
        setHistory([]);
      }
    })().catch(toastError);
  if (error) return <Detail markdown={plainTextMarkdown(error)} />;
  return (
    <List
      navigationTitle="AI Command History"
      isLoading={loading}
      searchBarPlaceholder="Search commands and results…"
      actions={
        <ActionPanel>
          <Action
            title="Clear History"
            icon={Icon.Trash}
            style="destructive"
            onAction={clear}
          />
        </ActionPanel>
      }
    >
      <List.EmptyView
        title="No saved results"
        description="Completed runs appear here when history is enabled."
        icon={Icon.Clock}
      />
      {history.map((entry) => (
        <List.Item
          key={entry.id}
          title={entry.command.name}
          subtitle={entry.result.slice(0, 90).replace(/\s+/g, " ")}
          keywords={[entry.result.slice(0, 500)]}
          accessories={[{ text: new Date(entry.createdAt).toLocaleString() }]}
          actions={
            <ActionPanel>
              <Action
                title="View Result"
                icon={Icon.Text}
                onAction={() =>
                  push(
                    <Detail
                      navigationTitle={entry.command.name}
                      markdown={plainTextMarkdown(entry.result)}
                      actions={
                        <ActionPanel>
                          {context && (
                            <Action
                              title="Paste to Source App"
                              icon={Icon.CopyClipboard}
                              onAction={() =>
                                void pasteToSource(entry.result, context).catch(
                                  toastError,
                                )
                              }
                            />
                          )}
                          <Action.CopyToClipboard
                            title="Copy Result"
                            content={entry.result}
                          />
                          <Action.Push
                            title="View Original Request"
                            icon={Icon.Text}
                            target={
                              <Detail
                                markdown={plainTextMarkdown(
                                  entry.renderedPrompt,
                                )}
                              />
                            }
                          />
                        </ActionPanel>
                      }
                    />,
                  )
                }
              />
              <Action.CopyToClipboard
                title="Copy Result"
                content={entry.result}
              />
              <Action
                title="Clear History"
                icon={Icon.Trash}
                style="destructive"
                onAction={clear}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
