import { useState, useEffect, useCallback } from "react";
import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Icon,
  List,
  Toast,
  showToast,
  closeMainWindow,
} from "@vicinae/api";
import {
  RbwError,
  RbwNotInstalledError,
  VaultEntry,
  getField,
  getCode,
  listEntries,
  searchEntries,
  listFields,
  isUnlocked,
  syncVault,
} from "./rbw";

type EntryState = { entries: VaultEntry[]; loaded: boolean };

type DetailedEntry = {
  name: string;
  user: string | null;
  password: string;
  fields: { name: string; value: string }[];
  notes: string | null;
};

async function fetchDetailedEntry(
  name: string,
  user?: string,
): Promise<DetailedEntry> {
  const fieldNames = await listFields(name, user);
  const fields: { name: string; value: string }[] = [];
  let password = "";
  let notes: string | null = null;

  for (const f of fieldNames) {
    const value = await getField(f, name, user);
    if (f === "password") {
      password = value;
    } else if (f === "notes") {
      notes = value;
    } else if (f !== "username" && f !== "totp" && f !== "uris") {
      fields.push({ name: f, value });
    }
  }

  return { name, user: user ?? null, password, fields, notes: notes ?? null };
}

async function performAction(
  title: string,
  value: string,
  actionType: "copy" | "paste" = "copy",
): Promise<void> {
  if (actionType === "copy") {
    await Clipboard.copy(value, { concealed: true });
    await showToast(Toast.Style.Success, `Copied ${title}`);
  } else {
    await Clipboard.paste(value);
    await closeMainWindow();
  }
}

export default function Command() {
  const [state, setState] = useState<EntryState>({
    entries: [],
    loaded: false,
  });
  const [locked, setLocked] = useState(false);
  const [notInstalled, setNotInstalled] = useState(false);
  const [searchText, setSearchText] = useState("");

  const loadEntries = useCallback(async () => {
    try {
      const unlocked = await isUnlocked();
      if (!unlocked) {
        setLocked(true);
        setState({ entries: [], loaded: true });
        return;
      }

      const entries = await listEntries();
      entries.sort((a, b) => a.name.localeCompare(b.name));
      setState({ entries, loaded: true });
    } catch (error) {
      if (error instanceof RbwNotInstalledError) {
        setNotInstalled(true);
        setState({ entries: [], loaded: true });
        return;
      }
      setState({ entries: [], loaded: true });
      showToast(
        Toast.Style.Failure,
        error instanceof RbwError ? error.message : "Failed to load entries",
      );
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const onSearchTextChange = useCallback(
    async (text: string) => {
      setSearchText(text);
      if (!text.trim()) {
        return loadEntries();
      }
      try {
        const results = await searchEntries(text);
        results.sort((a, b) => a.name.localeCompare(b.name));
        setState((prev) => ({ ...prev, entries: results }));
      } catch {
        setState((prev) => ({
          ...prev,
          entries: prev.entries.filter(
            (e) =>
              e.name.toLowerCase().includes(text.toLowerCase()) ||
              (e.user ?? "").toLowerCase().includes(text.toLowerCase()),
          ),
        }));
      }
    },
    [loadEntries],
  );
  
  if (notInstalled) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Warning}
          title="rbw is not installed"
          description="Install rbw to use this extension. See https://github.com/doy/rbw"
        />
      </List>
    );
  }

  if (locked) {
    return (
      <List>
        <List.Item
          icon={Icon.Lock}
          title="Vault Locked"
          subtitle="Press Enter to unlock"
          actions={
            <ActionPanel>
              <Action
                title="Unlock Vault"
                icon={Icon.LockUnlocked}
                onAction={async () => {
                  closeMainWindow();
                  try {
                    const { execFile } = await import("node:child_process");
                    const { promisify } = await import("node:util");
                    await promisify(execFile)("rbw", ["unlock"]);
                    setLocked(false);
                    await loadEntries();
                  } catch (error) {
                    showToast(
                      Toast.Style.Failure,
                      error instanceof RbwError
                        ? error.message
                        : "Failed to unlock vault",
                    );
                  }
                }}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  if (!state.loaded) {
    return <List isLoading />;
  }

  return (
    <List
      isLoading={!state.loaded}
      searchBarPlaceholder="Search passwords..."
      onSearchTextChange={onSearchTextChange}
      throttle
    >
      {state.entries.map((entry, index) => {
        const subtitle = entry.user ?? undefined;
        const keywords = [
          entry.name,
          entry.user ?? "",
          entry.folder ?? "",
          ...(entry.uris ?? []),
        ];

        return (
          <List.Item
            key={`${entry.id}-${index}`}
            title={entry.name}
            subtitle={subtitle}
            keywords={keywords}
            icon={Icon.Key}
            accessories={
              entry.folder
                ? [{ icon: Icon.Folder, text: entry.folder }]
                : undefined
            }
            actions={
              <ActionPanel>
                <ActionPanel.Section title="Copy to Clipboard">
                  <CopyPasswordAction entry={entry} />
                  <CopyUsernameAction entry={entry} />
                  <CopyTotpAction entry={entry} />
                </ActionPanel.Section>
                <ActionPanel.Section title="Paste to Frontmost App">
                  <PastePasswordAction entry={entry} />
                  <PasteUsernameAction entry={entry} />
                  <PasteTotpAction entry={entry} />
                </ActionPanel.Section>
                <ActionPanel.Section title="Details">
                  <ViewDetailsAction entry={entry} />
                </ActionPanel.Section>
                <ActionPanel.Section title="Vault">
                  <SyncAction loadEntries={loadEntries} />
                  <RefreshAction loadEntries={loadEntries} />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        );
      })}

      {state.entries.length === 0 && (
        <List.EmptyView
          icon={Icon.Key}
          title="No entries found"
          description={
            searchText
              ? "Try a different search term"
              : "No passwords in vault"
          }
        />
      )}
    </List>
  );
}

function SyncAction({ loadEntries }: { loadEntries: () => Promise<void> }) {
  return (
    <Action
      title="Sync Vault"
      icon={Icon.Cloud}
      onAction={async () => {
        try {
          await syncVault();
          showToast(Toast.Style.Success, "Vault synced");
          await loadEntries();
        } catch (error) {
          showToast(
            Toast.Style.Failure,
            error instanceof RbwError
              ? error.message
              : "Failed to sync vault",
          );
        }
      }}
    />
  );
}

function RefreshAction({ loadEntries }: { loadEntries: () => Promise<void> }) {
  return (
    <Action
      title="Refresh"
      icon={Icon.RotateClockwise}
      onAction={loadEntries}
    />
  );
}

function CopyPasswordAction({ entry }: { entry: VaultEntry }) {
  return (
    <Action
      title="Copy Password"
      icon={Icon.CopyClipboard}
      onAction={async () => {
        try {
          const password = await getField(
            "password",
            entry.name,
            entry.user ?? undefined,
          );
          await performAction("password", password);
        } catch (error) {
          showToast(
            Toast.Style.Failure,
            error instanceof RbwError
              ? error.message
              : "Failed to copy password",
          );
        }
      }}
    />
  );
}

function CopyUsernameAction({ entry }: { entry: VaultEntry }) {
  if (!entry.user) return null;
  return (
    <Action
      title="Copy Username"
      icon={Icon.Person}
      onAction={async () => {
        try {
          const username = await getField(
            "username",
            entry.name,
            entry.user ?? undefined,
          );
          await performAction("username", username);
        } catch (error) {
          showToast(
            Toast.Style.Failure,
            error instanceof RbwError
              ? error.message
              : "Failed to copy username",
          );
        }
      }}
    />
  );
}

function CopyTotpAction({ entry }: { entry: VaultEntry }) {
  return (
    <Action
      title="Copy TOTP Code"
      icon={Icon.Calendar}
      shortcut={{ modifiers: ["opt"], key: "return" }}
      onAction={async () => {
        try {
          const code = await getCode(entry.name, entry.user ?? undefined);
          await performAction("TOTP code", code);
        } catch (error) {
          showToast(
            Toast.Style.Failure,
            error instanceof RbwError
              ? error.message
              : "Failed to get TOTP code",
          );
        }
      }}
    />
  );
}

function PastePasswordAction({ entry }: { entry: VaultEntry }) {
  return (
    <Action
      title="Paste Password"
      icon={Icon.Text}
      onAction={async () => {
        try {
          const password = await getField(
            "password",
            entry.name,
            entry.user ?? undefined,
          );
          await performAction("password", password, "paste");
        } catch (error) {
          showToast(
            Toast.Style.Failure,
            error instanceof RbwError
              ? error.message
              : "Failed to paste password",
          );
        }
      }}
    />
  );
}

function PasteUsernameAction({ entry }: { entry: VaultEntry }) {
  if (!entry.user) return null;
  return (
    <Action
      title="Paste Username"
      icon={Icon.Person}
      onAction={async () => {
        try {
          const username = await getField(
            "username",
            entry.name,
            entry.user ?? undefined,
          );
          await performAction("username", username, "paste");
        } catch (error) {
          showToast(
            Toast.Style.Failure,
            error instanceof RbwError
              ? error.message
              : "Failed to paste username",
          );
        }
      }}
    />
  );
}

function PasteTotpAction({ entry }: { entry: VaultEntry }) {
  return (
    <Action
      title="Paste TOTP Code"
      icon={Icon.Calendar}
      onAction={async () => {
        try {
          const code = await getCode(entry.name, entry.user ?? undefined);
          await performAction("TOTP code", code, "paste");
        } catch (error) {
          showToast(
            Toast.Style.Failure,
            error instanceof RbwError
              ? error.message
              : "Failed to get TOTP code",
          );
        }
      }}
    />
  );
}

function ViewDetailsAction({ entry }: { entry: VaultEntry }) {
  return (
    <Action.Push
      title="View Details"
      icon={Icon.Eye}
      target={<EntryDetailView entry={entry} />}
    />
  );
}

function EntryDetailView({ entry }: { entry: VaultEntry }) {
  const [detail, setDetail] = useState<DetailedEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const detailed = await fetchDetailedEntry(
          entry.name,
          entry.user ?? undefined,
        );
        setDetail(detailed);
      } catch (e) {
        setError(
          e instanceof RbwError ? e.message : "Failed to load entry details",
        );
      }
    })();
  }, [entry]);

  if (error) {
    return <Detail markdown={`# Error\n\n${error}`} />;
  }

  if (!detail) {
    return <Detail markdown="Loading..." />;
  }

  const markdown = [
    `# ${detail.name}`,
    detail.user ? `**Username:** ${detail.user}` : null,
    "",
    "## Password",
    `\`\`\`\n${detail.password}\n\`\`\``,
    "",
    detail.notes ? `## Notes\n\n${detail.notes}\n\n` : "",
    detail.fields.length > 0
      ? `## Custom Fields\n\n${detail.fields
          .map((f) => `- **${f.name}:** \`${f.value}\``)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action
            title="Copy Password"
            icon={Icon.CopyClipboard}
            onAction={async () => {
              await Clipboard.copy(detail.password, { concealed: true });
              showToast(Toast.Style.Success, "Copied password");
            }}
          />
          {detail.user && (
            <Action
              title="Copy Username"
              icon={Icon.Person}
              onAction={async () => {
                await Clipboard.copy(detail.user!, { concealed: true });
                showToast(Toast.Style.Success, "Copied username");
              }}
            />
          )}
        </ActionPanel>
      }
    />
  );
}
