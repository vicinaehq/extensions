import { Action, ActionPanel, Detail, List } from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";
import type { Keybinding } from "./lib/gnome-keybindings";
import { readGnomeKeybindings, renderKeybindingsMarkdown } from "./lib/gnome-keybindings";

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesSearch(item: Keybinding, searchText: string): boolean {
  const query = normalizeSearch(searchText);
  if (!query) return true;

  const haystack = normalizeSearch(
    [item.name, item.section, item.bindings.join(" "), item.command ?? "", item.source].join(" "),
  );

  return query.split(" ").every((part) => haystack.includes(part));
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function shortcutSubtitle(item: Keybinding): string | undefined {
  return item.command || undefined;
}

function shortcutMarkdown(item: Keybinding): string {
  const lines = [
    `# ${item.name}`,
    "",
    `**Shortcut:** ${item.bindings.map((binding) => `\`${binding}\``).join(" / ")}`,
    "",
    `**Section:** ${item.section}`,
    "",
  ];

  if (item.command) {
    lines.push("**Command:**", "", "```bash", item.command, "```", "");
  }

  lines.push(`**Source:** \`${item.source}\``);

  return lines.join("\n");
}

function ErrorDetail({ message, onReload }: { message: string; onReload: () => void }) {
  return (
    <Detail
      markdown={[
        "# GNOME Keybindings",
        "",
        "Could not read GNOME keyboard shortcuts.",
        "",
        "```text",
        message,
        "```",
        "",
        "Make sure `gsettings` works from your user session:",
        "",
        "```bash",
        "gsettings list-recursively org.gnome.desktop.wm.keybindings",
        "```",
      ].join("\n")}
      actions={
        <ActionPanel>
          <Action title="Reload" onAction={onReload} />
        </ActionPanel>
      }
    />
  );
}

function ShortcutActions({ item, markdown, onReload }: { item: Keybinding; markdown: string; onReload: () => void }) {
  const binding = item.bindings.join(" / ");

  return (
    <ActionPanel>
      <Action.Push title="View Details" target={<Detail markdown={shortcutMarkdown(item)} />} />
      <Action.CopyToClipboard title="Copy Shortcut" content={binding} />
      <Action.CopyToClipboard title="Copy Action" content={item.name} />
      {item.command ? <Action.CopyToClipboard title="Copy Command" content={item.command} /> : null}
      <Action.CopyToClipboard title="Copy Full Cheatsheet" content={markdown} />
      <Action title="Reload" onAction={onReload} />
    </ActionPanel>
  );
}

export default function Command() {
  const [items, setItems] = useState<Keybinding[]>([]);
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setIsLoading(true);
    setError(null);

    try {
      const keybindings = await readGnomeKeybindings();
      setItems(keybindings);
    } catch (readError) {
      const message = readError instanceof Error ? readError.message : String(readError);
      setError(message);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  const filteredItems = useMemo(
    () => items.filter((item) => matchesSearch(item, searchText)),
    [items, searchText],
  );

  const sections = useMemo(() => unique(filteredItems.map((item) => item.section)), [filteredItems]);
  const fullMarkdown = useMemo(() => renderKeybindingsMarkdown(items), [items]);

  if (error) {
    return <ErrorDetail message={error} onReload={reload} />;
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search by shortcut, action, command or section..."
      onSearchTextChange={setSearchText}
      filtering={false}
    >
      {sections.map((section) => {
        const sectionItems = filteredItems.filter((item) => item.section === section);

        return (
          <List.Section key={section} title={section} subtitle={`${sectionItems.length}`}>
            {sectionItems.map((item) => (
              <List.Item
                key={`${item.section}-${item.source}-${item.bindings.join("|")}`}
                title={item.name}
                subtitle={shortcutSubtitle(item)}
                accessories={[
                  ...item.bindings.map((binding) => ({
                    tag: binding,
                  })),
                  { text: item.section },
                ]}
                keywords={[item.section, item.source, item.command ?? "", ...item.bindings]}
                actions={<ShortcutActions item={item} markdown={fullMarkdown} onReload={reload} />}
              />
            ))}
          </List.Section>
        );
      })}

      {!isLoading && filteredItems.length === 0 ? (
        <List.EmptyView
          title="No results"
          description="No shortcuts match your search."
          actions={
            <ActionPanel>
              <Action title="Reload" onAction={reload} />
              <Action.CopyToClipboard title="Copy Full Cheatsheet" content={fullMarkdown} />
            </ActionPanel>
          }
        />
      ) : null}
    </List>
  );
}
