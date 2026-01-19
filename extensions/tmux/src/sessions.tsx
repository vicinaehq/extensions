import { Action, ActionPanel, Icon, List, showToast, Toast, getPreferenceValues, closeMainWindow } from "@vicinae/api";
import { useState, useEffect } from "react";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

async function getTmuxPath(): Promise<string> {
  try {
    // Try to find tmux in PATH
    const { stdout } = await execAsync('which tmux');
    return stdout.trim();
  } catch {
    // Fallback to common locations
    const possiblePaths = [
      '/etc/profiles/per-user/knoopx/bin/tmux',
      '/usr/bin/tmux',
      '/usr/local/bin/tmux',
      '/opt/homebrew/bin/tmux'
    ];
    
    for (const path of possiblePaths) {
      try {
        await execAsync(`test -x ${path}`);
        return path;
      } catch {
        // Continue to next path
      }
    }
    
    // Last resort
    return 'tmux';
  }
}

export interface TmuxSession {
  name: string;
  attached: boolean;
  windows: number;
  created: string;
}

async function getTmuxSessions(): Promise<TmuxSession[]> {
  try {
    const tmuxPath = await getTmuxPath();
    const { stdout } = await execAsync(`${tmuxPath} list-sessions`);
    const lines = stdout.trim().split('\n');

    return lines.map(line => {
      // tmux list-sessions output format: "session_name: windows (attached/created)"
      // Example: "my-session: 2 windows (created Tue Jan 17 11:43:12 2025) (attached)"
      const match = line.match(/^([^:]+):\s*(\d+)\s*windows?\s*\(([^)]+)\)(?:\s*\((attached)\))?/);
      if (match) {
        const [, name, windows, created, attached] = match;
        return {
          name,
          attached: attached === 'attached',
          windows: parseInt(windows),
          created: created.replace('created ', '')
        };
      }
      return null;
    }).filter(Boolean) as TmuxSession[];
  } catch (error) {
    // If no sessions exist, tmux returns exit code 1
    if ((error as any).code === 1) {
      return [];
    }
    throw error;
  }
}

async function attachToSession(sessionName: string) {
  const preferences = getPreferenceValues();
  const terminalCommand = preferences.terminalCommand || 'wezterm';
  const terminalArgs = preferences.terminalArgs || 'start --';

  try {
    // Spawn terminal with tmux attach command
    const { spawn } = await import("child_process");
    const tmuxPath = await getTmuxPath();
    
    // Split terminal args and add tmux command as separate arguments
    const args = [...terminalArgs.split(' '), tmuxPath, 'attach-session', '-t', sessionName];
    
    spawn(terminalCommand, args, {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env }
    });

    await showToast({
      style: Toast.Style.Success,
      title: "Attached to session",
      message: `Opened ${sessionName} in terminal`,
    });

    // Close the Vicinae window after successful attachment
    closeMainWindow();
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to attach",
      message: `Could not open terminal: ${(error as any).message}`,
    });
  }
}

function RefreshSessionsAction({
  onAction,
  title = "Refresh Sessions",
}: {
  onAction: () => void;
  title?: string;
}) {
  return (
    <Action
      title={title}
      icon={Icon.ArrowClockwise}
      shortcut={{ modifiers: ["ctrl"], key: "r" }}
      onAction={onAction}
    />
  );
}

function CreateSessionAction({
  onAction,
  title = "Create New Session",
}: {
  onAction: () => void;
  title?: string;
}) {
  return (
    <Action
      title={title}
      icon={Icon.Plus}
      onAction={onAction}
    />
  );
}

async function createNewSession() {
  const preferences = getPreferenceValues();
  const terminalCommand = preferences.terminalCommand || 'wezterm';
  const terminalArgs = preferences.terminalArgs || 'start --';

  try {
    const { spawn } = await import("child_process");
    const tmuxPath = await getTmuxPath();
    
    // Split terminal args and add tmux command as separate arguments
    const args = [...terminalArgs.split(' '), tmuxPath];
    
    spawn(terminalCommand, args, {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env }
    });

    await showToast({
      style: Toast.Style.Success,
      title: "New session created",
      message: "Opened new tmux session in terminal",
    });

    // Close the Vicinae window after successful session creation
    closeMainWindow();
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to create session",
      message: `Could not open terminal: ${(error as any).message}`,
    });
  }
}

async function killSession(sessionName: string, refreshSessions: () => Promise<void>) {
  try {
    const tmuxPath = await getTmuxPath();
    await execAsync(`${tmuxPath} kill-session -t ${sessionName}`);
    
    await showToast({
      style: Toast.Style.Success,
      title: "Session killed",
      message: `Killed tmux session: ${sessionName}`,
    });
    
    // Refresh the session list
    await refreshSessions();
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to kill session",
      message: `Could not kill session ${sessionName}: ${(error as any).message}`,
    });
  }
}

export default function Sessions() {
  const [sessions, setSessions] = useState<TmuxSession[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshSessions = async () => {
    setLoading(true);
    try {
      const sessionList = await getTmuxSessions();
      setSessions(sessionList);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to list sessions",
        message: (error as any).message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSessions();
  }, []);

  if (sessions.length === 0 && !loading) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Terminal}
          title="No tmux sessions"
          description="No active tmux sessions found. Create a new session to get started."
          actions={
            <ActionPanel>
              <CreateSessionAction onAction={createNewSession} />
              <RefreshSessionsAction
                title="Refresh"
                onAction={refreshSessions}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="Search sessions..."
      actions={
        <ActionPanel>
          <CreateSessionAction onAction={createNewSession} />
          <RefreshSessionsAction onAction={refreshSessions} />
        </ActionPanel>
      }
    >
      {sessions.map((session) => (
        <List.Item
          key={session.name}
          title={session.name}
          subtitle={`${session.windows} window${session.windows !== 1 ? 's' : ''}`}
          icon={session.attached ? Icon.CheckCircle : Icon.Circle}
          accessories={[
            {
              text: session.attached ? "attached" : "detached",
              icon: session.attached ? Icon.Person : Icon.Circle,
            },
            {
              text: session.created,
            },
          ]}
          actions={
            <ActionPanel>
              <ActionPanel.Section>
                <Action
                  title="Attach to Session"
                  icon={Icon.Terminal}
                  onAction={() => attachToSession(session.name)}
                />
                <CreateSessionAction onAction={createNewSession} />
              </ActionPanel.Section>
              <ActionPanel.Section>
                <Action
                  title="Kill Session"
                  icon={Icon.Trash}
                  style="destructive"
                  onAction={() => killSession(session.name, refreshSessions)}
                />
              </ActionPanel.Section>
              <ActionPanel.Section>
                <RefreshSessionsAction onAction={refreshSessions} />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}