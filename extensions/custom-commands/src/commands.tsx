import { useEffect, useState, useMemo } from "react";
import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  confirmAlert,
  Icon,
  List,
  showToast,
  Toast,
} from "@vicinae/api";
import type { CustomCommand } from "./types";
import { loadCommands, deleteCommand, duplicateCommand, saveCommands, clearCorruptedStorage } from "./utils/storage";
import { executeCustomCommand, extractPlaceholders, isSystemPlaceholder } from "./utils/exec";
import { getIcon } from "./utils/icons";
import { AddCommandForm } from "./components/AddCommandForm";
import { EditCommandForm } from "./components/EditCommandForm";
import { RunWithArgsForm } from "./components/RunWithArgsForm";

export default function CustomCommands() {
  const [commands, setCommands] = useState<CustomCommand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await loadCommands();
        setCommands(data);
        setLoadError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setLoadError(msg);
        await showToast({ style: Toast.Style.Failure, title: "Failed to load commands", message: msg });
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  function handleCreated(c: CustomCommand) {
    setCommands((prev) => [...prev, c]);
  }

  function handleUpdated(updated: CustomCommand) {
    setCommands((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  async function handleDelete(cmd: CustomCommand) {
    const confirmed = await confirmAlert({
      title: "Delete Command",
      message: `Delete "${cmd.name}"? This cannot be undone.`,
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
      dismissAction: { title: "Cancel" },
    });
    if (!confirmed) return;
    const ok = await deleteCommand(cmd.id);
    if (ok) {
      setCommands((prev) => prev.filter((c) => c.id !== cmd.id));
      await showToast({ style: Toast.Style.Success, title: "Deleted", message: cmd.name });
    }
  }

  async function handleDuplicate(cmd: CustomCommand) {
    const dup = await duplicateCommand(cmd.id);
    if (dup) {
      setCommands((prev) => [...prev, dup]);
      await showToast({ style: Toast.Style.Success, title: "Duplicated", message: dup.name });
    }
  }

  async function handleExport() {
    if (loadError) {
      await showToast({ style: Toast.Style.Failure, title: "Cannot export", message: loadError });
      return;
    }
    if (commands.length === 0) {
      await showToast({ style: Toast.Style.Failure, title: "Nothing to export" });
      return;
    }
    const exportData = commands.map(({ name, command, description, workdir, terminal, icon, group }) => ({
      name,
      command,
      description,
      workdir,
      terminal,
      icon,
      group,
    }));
    await Clipboard.copy(JSON.stringify(exportData, null, 2));
    await showToast({ style: Toast.Style.Success, title: "Copied to clipboard", message: `${commands.length} commands` });
  }

  async function handleImport(text: string) {
    if (loadError) {
      await showToast({ style: Toast.Style.Failure, title: "Cannot import", message: "Storage is corrupted. Clear it first." });
      return;
    }
    try {
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      const toAdd = arr
        .filter(
          (e) =>
            e &&
            typeof e.name === "string" &&
            e.name.trim().length > 0 &&
            typeof e.command === "string" &&
            e.command.trim().length > 0,
        )
        .map((e) => ({
          id: crypto.randomUUID(),
          name: String(e.name).trim(),
          command: String(e.command).trim(),
          description: e.description ? String(e.description).trim() : undefined,
          workdir: e.workdir ? String(e.workdir).trim() : undefined,
          terminal: Boolean(e.terminal),
          icon: e.icon ? String(e.icon).trim() : undefined,
          group: e.group ? String(e.group).trim() : undefined,
          createdAt: new Date().toISOString(),
        }));
      if (toAdd.length === 0) throw new Error("No valid commands found");
      const merged = [...commands, ...toAdd];
      await saveCommands(merged);
      setCommands(merged);
      await showToast({ style: Toast.Style.Success, title: "Imported", message: `${toAdd.length} commands` });
    } catch (e) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Import failed",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const isSearching = searchText.trim().length > 0;

  const allGroups = useMemo(() => {
    const set = new Set<string>();
    for (const c of commands) {
      const g = c.group?.trim();
      if (g) set.add(g);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [commands]);

  const hasUngrouped = useMemo(() => commands.some((c) => !c.group?.trim()), [commands]);

  const filtered = useMemo(() => {
    return commands.filter((c) => {
      if (!isSearching) return true;
      const q = searchText.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.command.toLowerCase().includes(q) ||
        (c.description?.toLowerCase().includes(q) ?? false) ||
        (c.group?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [commands, searchText, isSearching]);

  const groupFiltered = useMemo(() => {
    if (selectedGroup === "all") return filtered;
    return filtered.filter((c) => (c.group?.trim() || "Ungrouped") === selectedGroup);
  }, [filtered, selectedGroup]);

  const grouped = useMemo(() => {
    const map = new Map<string, CustomCommand[]>();
    for (const cmd of groupFiltered) {
      const key = cmd.group?.trim() || "Ungrouped";
      const arr = map.get(key);
      if (arr) arr.push(cmd);
      else map.set(key, [cmd]);
    }
    const entries = [...map.entries()].sort((a, b) => {
      if (a[0] === "Ungrouped") return 1;
      if (b[0] === "Ungrouped") return -1;
      return a[0].localeCompare(b[0]);
    });
    return entries;
  }, [groupFiltered]);

  const showCreateFromSearch = isSearching && groupFiltered.length === 0;

  useEffect(() => {
    if (selectedGroup !== "all") {
      const exists = allGroups.includes(selectedGroup) || (selectedGroup === "Ungrouped" && hasUngrouped);
      if (!exists) setSelectedGroup("all");
    }
  }, [allGroups, hasUngrouped, selectedGroup]);

  if (loadError) {
    return (
      <List isLoading={isLoading} searchBarPlaceholder="Search commands...">
        <List.Section title="Storage Error">
          <List.Item
            title="Failed to load commands"
            subtitle={loadError}
            icon={Icon.Warning}
            accessories={[{ text: "Corrupted storage", icon: Icon.Warning }]}
            actions={
              <ActionPanel>
                <Action
                  title="Retry Loading"
                  icon={Icon.ArrowClockwise}
                  onAction={async () => {
                    setIsLoading(true);
                    try {
                      const data = await loadCommands();
                      setCommands(data);
                      setLoadError(null);
                      await showToast({ style: Toast.Style.Success, title: "Loaded" });
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : String(e);
                      setLoadError(msg);
                      await showToast({ style: Toast.Style.Failure, title: "Still failing", message: msg });
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                />
                <Action
                  title="Clear Corrupted Storage"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  onAction={async () => {
                    const confirmed = await confirmAlert({
                      title: "Clear Storage?",
                      message: "This will delete all stored commands. Export first if possible.",
                      primaryAction: { title: "Clear", style: Alert.ActionStyle.Destructive },
                    });
                    if (!confirmed) return;
                    await clearCorruptedStorage();
                    setCommands([]);
                    setLoadError(null);
                    await showToast({ style: Toast.Style.Success, title: "Storage cleared" });
                  }}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search commands or type to create..."
      filtering={false}
      searchBarAccessory={
        allGroups.length > 0 || hasUngrouped ? (
          <List.Dropdown tooltip="Filter by group" value={selectedGroup} onChange={setSelectedGroup}>
            <List.Dropdown.Item title="All Groups" value="all" icon={Icon.Layers} />
            {allGroups.map((g) => (
              <List.Dropdown.Item key={g} title={g} value={g} icon={Icon.Tag} />
            ))}
            {hasUngrouped && <List.Dropdown.Item title="Ungrouped" value="Ungrouped" icon={Icon.Circle} />}
          </List.Dropdown>
        ) : undefined
      }
    >
      {!isSearching && selectedGroup === "all" && (
        <List.Section title="Actions">
          <List.Item
            key="__add__"
            title="Create Custom Command"
            subtitle="Add a new shell command"
            icon={Icon.Plus}
            actions={
              <ActionPanel>
                <Action.Push title="Create Command" icon={Icon.Plus} target={<AddCommandForm onCreated={handleCreated} />} />
                <Action title="Export to Clipboard" icon={Icon.Upload} shortcut={{ modifiers: ["cmd", "shift"], key: "e" }} onAction={handleExport} />
                <Action.CopyToClipboard
                  title="Import from Clipboard"
                  content=""
                  onCopy={async () => {
                    const text = await Clipboard.readText();
                    if (text) await handleImport(text);
                    else await showToast({ style: Toast.Style.Failure, title: "Clipboard empty" });
                  }}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      )}

      {showCreateFromSearch && (
        <List.Section title="Create">
          <List.Item
            title={`Create command "${searchText}"`}
            subtitle="No matching command found"
            icon={Icon.PlusCircle}
            actions={
              <ActionPanel>
                <Action.Push title="Create Command" icon={Icon.Plus} target={<AddCommandForm onCreated={handleCreated} />} />
              </ActionPanel>
            }
          />
        </List.Section>
      )}

      {groupFiltered.length === 0 && !showCreateFromSearch ? (
        <List.Section title="Your Commands" subtitle="0 commands">
          <List.Item
            title={commands.length === 0 ? "No commands yet" : "No matches"}
            subtitle={
              commands.length === 0
                ? "Use the action above to create your first command"
                : selectedGroup !== "all"
                  ? `No results in "${selectedGroup}" for "${searchText}"`
                  : `No results for "${searchText}"`
            }
            icon={Icon.Terminal}
          />
        </List.Section>
      ) : (
        grouped.map(([groupName, cmds]) => (
          <List.Section key={groupName} title={groupName} subtitle={`${cmds.length} ${cmds.length === 1 ? "command" : "commands"}`}>
            {cmds.map((cmd) => {
              const placeholders = extractPlaceholders(cmd.command);
              const userPlaceholders = placeholders.filter((k) => !isSystemPlaceholder(k));
              const hasPlaceholders = placeholders.length > 0;
              const requiresUserInput = userPlaceholders.length > 0;
              const badgeText = userPlaceholders.length > 0 ? userPlaceholders.map((k) => `{{${k}}}`).join(" ") : hasPlaceholders ? placeholders.map((k) => `{{${k}}}`).join(" ") : undefined;
              return (
                <List.Item
                  key={cmd.id}
                  title={cmd.name}
                  subtitle={cmd.command}
                  keywords={[cmd.name, cmd.command, cmd.description ?? "", cmd.group ?? ""]}
                  icon={getIcon(cmd.icon)}
                  accessories={[
                    ...(cmd.group?.trim() && selectedGroup === "all" ? [{ text: cmd.group.trim(), icon: Icon.Tag } as const] : []),
                    ...(cmd.terminal ? [{ icon: Icon.AppWindow, tooltip: "Runs in terminal" } as const] : []),
                    ...(cmd.description ? [{ text: cmd.description } as const] : []),
                    ...(badgeText ? [{ text: badgeText, tooltip: `Placeholders: ${badgeText}` } as const] : []),
                  ]}
                  actions={
                    <ActionPanel>
                      {requiresUserInput ? (
                        <Action.Push
                          title="Run with Arguments"
                          icon={Icon.Play}
                          target={<RunWithArgsForm command={cmd} />}
                        />
                      ) : (
                        <Action
                          title="Run Command"
                          icon={Icon.Play}
                          onAction={() =>
                            executeCustomCommand({ command: cmd.command, workdir: cmd.workdir, terminal: cmd.terminal })
                          }
                        />
                      )}
                      {requiresUserInput && (
                        <Action
                          title="Run Without Arguments"
                          icon={Icon.Play}
                          onAction={() =>
                            executeCustomCommand({ command: cmd.command, workdir: cmd.workdir, terminal: cmd.terminal })
                          }
                        />
                      )}
                      <Action.CopyToClipboard title="Copy Command" content={cmd.command} icon={Icon.CopyClipboard} />
                      <Action.Push
                        title="Edit Command"
                        icon={Icon.Pencil}
                        shortcut={{ modifiers: ["cmd"], key: "e" }}
                        target={<EditCommandForm command={cmd} onUpdated={handleUpdated} />}
                      />
                      <Action
                        title="Duplicate"
                        icon={Icon.Duplicate}
                        shortcut={{ modifiers: ["cmd"], key: "d" }}
                        onAction={() => handleDuplicate(cmd)}
                      />
                      <Action
                        title="Delete Command"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        shortcut={{ modifiers: ["ctrl"], key: "x" }}
                        onAction={() => handleDelete(cmd)}
                      />
                      <ActionPanel.Section title="Clipboard">
                        <Action title="Export All to Clipboard" icon={Icon.Upload} onAction={handleExport} />
                        <Action.CopyToClipboard
                          title="Copy as JSON"
                          content={JSON.stringify(cmd, null, 2)}
                          icon={Icon.Code}
                        />
                      </ActionPanel.Section>
                    </ActionPanel>
                  }
                />
              );
            })}
          </List.Section>
        ))
      )}
    </List>
  );
}
