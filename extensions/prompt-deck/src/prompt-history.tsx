import {
  Action,
  ActionPanel,
  Alert,
  Icon,
  List,
  confirmAlert,
  getPreferenceValues,
  openExtensionPreferences,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";
import { CopyAction } from "./components/CopyAction";
import { HistoryDetail } from "./components/HistoryDetail";
import { ShortcutRunner } from "./components/ShortcutRunner";
import { SHORTCUT_REMOVE, SHORTCUT_REMOVE_ALL } from "./lib/constants";
import { showFailureToast } from "./lib/feedback";
import { findLatestMessage } from "./lib/prompt";
import { formatProvider } from "./lib/providers";
import { ShortcutRepository } from "./lib/storage";
import { preview, searchText as normalizeSearchText } from "./lib/string";
import type { Preferences, ShortcutRun } from "./lib/types";

const repository = new ShortcutRepository();

export default function PromptHistory() {
  const { push } = useNavigation();
  const historyEnabled = getPreferenceValues<Preferences>().enableHistory !== false;
  const [runs, setRuns] = useState<ShortcutRun[]>([]);
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function reload() {
    setIsLoading(true);
    try {
      setRuns(await repository.listRuns());
    } catch (error) {
      await showFailureToast("Failed to load history", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const filteredRuns = useMemo(() => {
    const query = normalizeSearchText(searchText);
    if (!query) {
      return runs;
    }

    return runs.filter((run) => {
      const answer = findLatestMessage(run.messages, "assistant", true)?.content ?? "";
      return [run.shortcutName, run.command, answer].some((value) => normalizeSearchText(value).includes(query));
    });
  }, [runs, searchText]);

  const groupedRuns = useMemo(() => {
    const groups = new Map<string, ShortcutRun[]>();
    for (const run of filteredRuns) {
      const existing = groups.get(run.shortcutName) ?? [];
      existing.push(run);
      groups.set(run.shortcutName, existing);
    }

    return Array.from(groups.entries());
  }, [filteredRuns]);

  async function deleteRun(run: ShortcutRun) {
    try {
      await repository.deleteRun(run.id);
    } catch (error) {
      await showFailureToast("Failed to delete entry", error);
      return;
    }

    await showToast({ style: Toast.Style.Success, title: "History entry deleted" });
    await reload();
  }

  async function clearHistory() {
    const confirmed = await confirmAlert({
      title: "Clear History",
      message: "All saved prompt history will be deleted.",
      primaryAction: { title: "Clear", style: Alert.ActionStyle.Destructive },
    });

    if (!confirmed) {
      return;
    }

    try {
      await repository.clearRuns();
    } catch (error) {
      await showFailureToast("Failed to clear history", error);
      return;
    }

    await showToast({ style: Toast.Style.Success, title: "History cleared" });
    await reload();
  }

  return (
    <List
      isLoading={isLoading}
      filtering={false}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search prompt history..."
    >
      {filteredRuns.length === 0 && !isLoading ? (
        <List.EmptyView
          title={runs.length === 0 ? (historyEnabled ? "No History" : "History Is Disabled") : "No Matches"}
          description={
            runs.length === 0
              ? historyEnabled
                ? "Run a prompt to create history."
                : "New runs are not saved. Enable history in the extension preferences."
              : "Try another search."
          }
          icon={historyEnabled || runs.length > 0 ? Icon.Clock : Icon.EyeDisabled}
          actions={
            historyEnabled ? undefined : (
              <ActionPanel>
                <Action title="Open Extension Preferences" icon={Icon.Cog} onAction={openExtensionPreferences} />
              </ActionPanel>
            )
          }
        />
      ) : null}

      {!historyEnabled && filteredRuns.length > 0 ? (
        <List.Item
          icon={Icon.EyeDisabled}
          title="History is disabled"
          subtitle="New runs are not saved. Existing entries are shown below."
          actions={
            <ActionPanel>
              <Action title="Open Extension Preferences" icon={Icon.Cog} onAction={openExtensionPreferences} />
            </ActionPanel>
          }
        />
      ) : null}

      {groupedRuns.map(([shortcutName, shortcutRuns]) => (
        <List.Section key={shortcutName} title={shortcutName} subtitle={`${shortcutRuns.length} run${shortcutRuns.length === 1 ? "" : "s"}`}>
          {shortcutRuns.map((run) => {
            const answer = findLatestMessage(run.messages, "assistant", true)?.content ?? "";
            return (
              <List.Item
                key={run.id}
                id={run.id}
                title={preview(run.command, 70)}
                subtitle={new Date(run.createdAt).toLocaleString()}
                icon={Icon.Clock}
                accessories={[{ tag: formatProvider(run.provider) }, { text: run.model }]}
                actions={
                  <ActionPanel>
                    <Action title="View Result" icon={Icon.Eye} onAction={() => push(<HistoryDetail run={run} />)} />
                    <Action title="Run Prompt Again" icon={Icon.Play} onAction={() => push(<ShortcutRunner shortcutId={run.shortcutId} />)} />
                    {answer ? (
                      <CopyAction
                        title="Copy"
                        icon={Icon.CopyClipboard}
                        content={answer}
                        closeWindowOnCopy={run.closeWindowOnCopy ?? false}
                      />
                    ) : null}
                    <CopyAction
                      title="Copy Command"
                      icon={Icon.Text}
                      content={run.command}
                      closeWindowOnCopy={run.closeWindowOnCopy ?? false}
                    />
                    <Action
                      title="Delete Entry"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      shortcut={SHORTCUT_REMOVE}
                      onAction={() => deleteRun(run)}
                    />
                    <Action
                      title="Clear History"
                      icon={Icon.XMarkCircle}
                      style={Action.Style.Destructive}
                      shortcut={SHORTCUT_REMOVE_ALL}
                      onAction={clearHistory}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      ))}
    </List>
  );
}
