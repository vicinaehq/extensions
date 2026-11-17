import {
  Action, ActionPanel, Alert, Clipboard, Form, Keyboard, List, Toast,
  confirmAlert, environment, getPreferenceValues, openExtensionPreferences, runInTerminal, showToast, useNavigation,
  type LaunchProps,
} from "@vicinae/api";
import { useEffect, useMemo, useRef, useState } from "react";
import path from "node:path";
import { resolveSettings, type Preferences, type Settings } from "./lib/paths";
import { type HistoryEntry } from "./lib/history";
import { createHistorySearchWithMatches } from "./lib/rank";
import { styledCommandTitle } from "./lib/highlight";
import { historyError, readHistory } from "./lib/reader";
import { commandProblem, hasLikelySecret } from "./lib/privacy";
import { executeCommand, preflightExecution } from "./lib/execution";
import { createHandoff } from "./lib/handoff";
import AliasSetup from "./alias-setup";

async function copyCommand(command: string) {
  try {
    if (hasLikelySecret(command) && !await confirmAlert({ title: "Copy sensitive command?", message: "The full, unredacted command will be placed on the system clipboard. Other applications may read it.", primaryAction: { title: "Copy" } })) return;
    await Clipboard.copy(command, { concealed: true });
    await showToast({ style: Toast.Style.Success, title: "Command copied" });
  } catch {
    await showToast({ style: Toast.Style.Failure, title: "Could not copy command" });
  }
}

function useRunCommand(settings: Settings | undefined) {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function run(command: string) {
    if (pending.current || !settings) return;
    pending.current = true;
    setBusy(true);
    try {
      const problem = commandProblem(command);
      if (problem) {
        await showToast({ style: Toast.Style.Failure, title: "Command needs editing", message: problem });
        return;
      }
      const launched = await executeCommand(command, settings, {
        confirm: () => confirmAlert({
          title: "Run this command in a terminal?",
          message: `Shell: ${settings.shell}\nDirectory: ${settings.workingDirectory}\n\n${command}\n\nRuns as your user, without a sandbox. ${settings.saveHistory ? "The full command will be saved to shell history after exit (including any credentials)." : "Saving to shell history is disabled."}`,
          primaryAction: { title: "Run in Terminal", style: Alert.ActionStyle.Destructive },
        }),
        preflight: () => preflightExecution(settings),
        prepare: createHandoff,
        runner: { executable: process.execPath, script: path.join(environment.assetsPath, "run-command.cjs") },
        launch: runInTerminal,
      });
      if (launched) await showToast({ style: Toast.Style.Success, title: "Terminal launch requested", message: "If no window appeared, check Vicinae's default terminal configuration." });
    } catch {
      // Never expose raw process/API errors: these can include command contents.
      await showToast({ style: Toast.Style.Failure, title: "Could not launch terminal", message: "Check the shell executable, working directory, and Vicinae's default terminal configuration." });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { busy, run };
}

function CommandEditor({ initial, settings }: { initial: string; settings: Settings }) {
  const [command, setCommand] = useState(initial);
  const { busy, run } = useRunCommand(settings);
  const problem = commandProblem(command);
  return (
    <Form navigationTitle="Review and Edit Command" enableDrafts={false} isLoading={busy} actions={
      <ActionPanel>
        <Action title="Run in Terminal…" onAction={() => run(command)} />
        <Action title="Copy Command" shortcut={Keyboard.Shortcut.Common.Copy} onAction={() => copyCommand(command)} />
      </ActionPanel>
    }>
      <Form.Description title="Execution" text={`Shell: ${settings.shellPath}\nDirectory: ${settings.workingDirectory}\nPipes, redirects and newlines are interpreted by this shell. Non-interactive: session aliases and unsaved history are unavailable. ${settings.confirmBeforeRun ? "Running requires confirmation." : "Confirmation is disabled: Run launches immediately."} ${settings.saveHistory ? "Executed commands are saved to shell history." : "History saving is disabled."} ${settings.hold ? "Press Enter in the terminal to close it after execution." : "Terminal closes after execution."}`} />
      <Form.TextArea id="command" title="Command (unredacted)" value={command} onChange={setCommand} error={problem} autoFocus storeValue={false} />
      {hasLikelySecret(command) && <Form.Description title="Sensitive command" text="This command may contain credentials. It is revealed here for intentional review. Copying requires separate confirmation." />}
    </Form>
  );
}

export default function Bang(props: LaunchProps) {
  // fallbackText is delivered only when the user activates a fallback/deeplink.
  // Do not strip a leading !: in the command view it is literal shell input.
  const [query, setQuery] = useState(props.fallbackText ?? "");
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [settings, setSettings] = useState<Settings>();
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const { push } = useNavigation();
  const { busy: launching, run } = useRunCommand(settings);
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setEntries([]);
      setMessage(undefined);
      let resolved: Settings;
      try {
        resolved = resolveSettings(getPreferenceValues<Preferences>());
        if (active) setSettings(resolved);
      } catch {
        if (active) {
          setSettings(undefined);
          setMessage("Invalid preferences. Choose a supported shell, absolute paths, and a Maximum History Items value from 1 to 50000.");
          setLoading(false);
        }
        return;
      }
      try {
        const snapshot = await readHistory(resolved.historyPath, resolved.shell, resolved.maxItems);
        if (active) {
          setEntries(snapshot.entries);
          setMessage(snapshot.notices.join(" ") || undefined);
        }
      } catch (error) {
        if (active) setMessage(historyError(error));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [revision]);
  const search = useMemo(() => createHistorySearchWithMatches(entries), [entries]);
  const results = useMemo(() => search(query), [search, query]);
  const reload = () => setRevision(value => value + 1);
  const common = <>
    <Action title="Reload History" shortcut={Keyboard.Shortcut.Common.Refresh} onAction={reload} />
    <Action title="Set Up ! Alias…" onAction={() => push(<AliasSetup />)} />
    <Action title="Open Preferences" onAction={() => openExtensionPreferences()} />
  </>;
  function actions(command: string) {
    return <ActionPanel>
      {settings && !settings.reviewBeforeRun && <Action title="Run in Terminal…" onAction={() => run(command)} />}
      <Action title="Review and Edit Command" shortcut={Keyboard.Shortcut.Common.Edit} onAction={() => settings && push(<CommandEditor initial={command} settings={settings} />)} />
      <Action title="Copy Command" shortcut={Keyboard.Shortcut.Common.Copy} onAction={() => copyCommand(command)} />
      {common}
    </ActionPanel>;
  }
  return (
    <List isLoading={loading || launching} filtering={false} searchText={query} onSearchTextChange={setQuery}
      navigationTitle="Bang — Local Shell History" searchBarPlaceholder="Search history or type a new command…" actions={<ActionPanel>{common}</ActionPanel>}>
      {message && <List.Section title="History Notice"><List.Item id="notice" title="History needs attention" subtitle={message} actions={<ActionPanel>{common}</ActionPanel>} /></List.Section>}
      {results.length > 0 && <List.Section title="History" subtitle={`${entries.length} unique commands loaded`}>
        {results.map(({ item, ranges }, index) => <List.Item key={item.command} id={`history-${index}`} title={styledCommandTitle(item.command, ranges)} subtitle={`${item.source} · ${item.frequency ?? 1} use(s)`} actions={actions(item.command)} />)}
      </List.Section>}
      {query.trim() && settings && <List.Section title={results.length ? "New Command" : "No Matches — Use Your Input"}>
        <List.Item id="new-command" title={styledCommandTitle(query)} subtitle="Review or edit your exact input; nothing runs on selection" actions={actions(query)} />
      </List.Section>}
      {!loading && !results.length && !query.trim() && !message && <List.EmptyView title="No saved history" description="Type a new command, or flush your shell history and use Reload History. Check Shell and History Path in preferences." />}
    </List>
  );
}
