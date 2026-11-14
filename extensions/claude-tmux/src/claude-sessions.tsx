import { type FSWatcher, watch } from "node:fs";
import { homedir } from "node:os";
import { Action, ActionPanel, Color, Icon, List, PopToRootType, closeMainWindow, showHUD } from "@vicinae/api";
import { useEffect, useState } from "react";
import { CLAUDE_SESSION_RECORDS_DIR, type AgentSession, listAgentSessions } from "./sessions";
import { switchToPane } from "./switch";

const POLL_INTERVAL_MS = 10_000;
const WATCH_DEBOUNCE_MS = 150;

type Group = "attention" | "working" | "idle" | "unknown";

const GROUPS: { group: Group; title: string }[] = [
  { group: "attention", title: "Needs Attention" },
  { group: "working", title: "Working" },
  { group: "idle", title: "Idle" },
  { group: "unknown", title: "Status Unknown" },
];

const PRESENTATION: Record<Group, { icon: Icon; color: Color; label: string }> = {
  attention: { icon: Icon.Warning, color: Color.Orange, label: "Waiting" },
  working: { icon: Icon.CircleProgress, color: Color.Blue, label: "Working" },
  idle: { icon: Icon.Circle, color: Color.SecondaryText, label: "Idle" },
  unknown: { icon: Icon.QuestionMarkCircle, color: Color.SecondaryText, label: "Unknown" },
};

function groupOf(session: AgentSession): Group {
  switch (session.status) {
    case "waiting":
      return "attention";
    case "busy":
      return "working";
    case "idle":
      return "idle";
    default:
      return "unknown";
  }
}

function statusLabel(session: AgentSession): string {
  const reason = session.status === "waiting" ? session.waitingFor : undefined;
  return reason ? reason.charAt(0).toUpperCase() + reason.slice(1) : PRESENTATION[groupOf(session)].label;
}

function tmuxTarget(session: AgentSession): string {
  const window = `${session.tmuxSession}:${session.windowIndex}`;
  return session.windowPanes > 1 ? `${window}.${session.paneIndex}` : window;
}

function displayPath(path: string): string {
  const home = homedir();
  return path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function watchSessionRecords(onChange: () => void): FSWatcher | undefined {
  try {
    return watch(CLAUDE_SESSION_RECORDS_DIR, onChange).on("error", () => undefined);
  } catch {
    return undefined;
  }
}

function useClaudeSessions() {
  const [sessions, setSessions] = useState<AgentSession[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let rerun = false;
    let debounce: NodeJS.Timeout | undefined;

    const refresh = () => {
      if (inFlight) {
        rerun = true;
        return;
      }
      inFlight = true;
      listAgentSessions()
        .then((next) => {
          if (!disposed) {
            setSessions(next);
            setError(undefined);
          }
        })
        .catch((reason) => {
          if (!disposed) {
            setError(errorMessage(reason));
          }
        })
        .finally(() => {
          inFlight = false;
          if (rerun && !disposed) {
            rerun = false;
            refresh();
          }
        });
    };

    const scheduleRefresh = () => {
      clearTimeout(debounce);
      debounce = setTimeout(refresh, WATCH_DEBOUNCE_MS);
    };

    refresh();
    const poll = setInterval(refresh, POLL_INTERVAL_MS);
    const watcher = watchSessionRecords(scheduleRefresh);

    return () => {
      disposed = true;
      clearInterval(poll);
      clearTimeout(debounce);
      watcher?.close();
    };
  }, []);

  return { sessions, error };
}

async function switchTo(session: AgentSession) {
  await closeMainWindow({ clearRootSearch: true, popToRootType: PopToRootType.Immediate });
  try {
    await switchToPane(session.paneId);
  } catch (error) {
    await showHUD(`Could not switch to ${tmuxTarget(session)}: ${errorMessage(error)}`);
  }
}

function SessionItem({ session }: { session: AgentSession }) {
  const group = groupOf(session);
  const { icon, color } = PRESENTATION[group];
  const label = statusLabel(session);
  const target = tmuxTarget(session);
  const path = displayPath(session.cwd);

  return (
    <List.Item
      id={`${session.paneId}:${session.pid}`}
      title={session.windowName}
      subtitle={`${target} · ${session.agent} · ${path}`}
      icon={{ value: { source: icon, tintColor: color }, tooltip: label }}
      keywords={[target, path, session.agent, label, session.name ?? ""]}
      accessories={[{ text: session.name }, { tag: { value: label, color } }]}
      actions={
        <ActionPanel>
          <Action title="Switch to Window" icon={Icon.Terminal} onAction={() => switchTo(session)} />
        </ActionPanel>
      }
    />
  );
}

export default function ClaudeSessions() {
  const { sessions, error } = useClaudeSessions();

  return (
    <List isLoading={sessions === undefined && !error} searchBarPlaceholder="Search Claude Code sessions in tmux">
      {error ? (
        <List.EmptyView icon={Icon.Warning} title="Could not list Claude Code sessions" description={error} />
      ) : (
        <List.EmptyView
          icon={Icon.Terminal}
          title="No Claude Code or Codex sessions in tmux"
          description="Sessions appear here as soon as either agent starts in a tmux pane."
        />
      )}
      {GROUPS.map(({ group, title }) => {
        const members = (sessions ?? []).filter((session) => groupOf(session) === group);
        return members.length === 0 ? null : (
          <List.Section key={group} title={title} subtitle={String(members.length)}>
            {members.map((session) => (
            <SessionItem key={`${session.paneId}:${session.pid}`} session={session} />
            ))}
          </List.Section>
        );
      })}
    </List>
  );
}
