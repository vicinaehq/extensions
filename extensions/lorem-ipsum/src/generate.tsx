import { useMemo, useState } from "react";
import { Action, ActionPanel, Color, Icon, List } from "@vicinae/api";
import { generate, textStats, type Kind } from "./lib/generator";
import { actionLabel, getPrefs, produceOutput } from "./lib/output";
import { parseQuery } from "./lib/run";

const KINDS: { id: Kind; title: string; icon: Icon; unit: string }[] = [
  { id: "paragraphs", title: "Paragraphs", icon: Icon.Paragraph, unit: "paragraph" },
  { id: "sentences", title: "Sentences", icon: Icon.SpeechBubble, unit: "sentence" },
  { id: "words", title: "Words", icon: Icon.Text, unit: "word" },
  { id: "titles", title: "Titles", icon: Icon.Heading, unit: "word" },
  { id: "list", title: "List", icon: Icon.BulletPoints, unit: "item" },
  { id: "html", title: "HTML", icon: Icon.Code, unit: "paragraph" },
];

const PRESETS: Record<Kind, number[]> = {
  paragraphs: [1, 2, 3, 5, 8],
  sentences: [1, 2, 3, 5, 10],
  words: [5, 10, 20, 50, 100],
  titles: [3, 5, 8, 12],
  list: [3, 5, 8, 12],
  html: [1, 2, 3, 5],
};

export default function GenerateCommand() {
  const { action, startWithLorem } = getPrefs();
  const [kind, setKind] = useState<Kind>("paragraphs");
  const [query, setQuery] = useState("");
  const [generation, setGeneration] = useState(0);

  const parsed = parseQuery(query);
  const activeKind = parsed.kind ?? kind;
  const meta = KINDS.find((item) => item.id === activeKind) ?? KINDS[0];

  const counts = useMemo(() => {
    const presets = PRESETS[activeKind];
    if (parsed.count && !presets.includes(parsed.count)) {
      return [parsed.count, ...presets];
    }
    if (parsed.count) {
      return [parsed.count, ...presets.filter((n) => n !== parsed.count)];
    }
    return presets;
  }, [activeKind, parsed.count]);

  const items = useMemo(
    () =>
      counts.map((count) => ({
        id: `${activeKind}-${count}`,
        count,
        text: generate({ kind: activeKind, count, startWithLorem }),
      })),
    [activeKind, counts, generation, startWithLorem],
  );

  return (
    <List
      isShowingDetail
      searchText={query}
      searchBarPlaceholder="Count — 3, 5p, 20w, 8l"
      onSearchTextChange={(value) => {
        setQuery(value);
        const next = parseQuery(value);
        if (next.kind) setKind(next.kind);
      }}
      searchBarAccessory={
        <List.Dropdown tooltip="Type" value={kind} onChange={(value) => setKind(value as Kind)}>
          {KINDS.map((item) => (
            <List.Dropdown.Item key={item.id} title={item.title} value={item.id} icon={item.icon} />
          ))}
        </List.Dropdown>
      }
    >
      {items.map((item, index) => {
        const stats = textStats(item.text);
        const label = `${item.count} ${plural(meta.unit, item.count)}`;

        return (
          <List.Item
            key={item.id}
            title={label}
            icon={meta.icon}
            accessories={index === 0 && parsed.count ? [{ tag: { value: "custom", color: Color.Blue } }] : undefined}
            actions={<OutputActions content={item.text} action={action} onRegenerate={() => setGeneration((n) => n + 1)} />}
            detail={
              <List.Item.Detail
                markdown={previewMarkdown(activeKind, item.text)}
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label title="Type" text={meta.title} />
                    <List.Item.Detail.Metadata.Label title="Count" text={String(item.count)} />
                    <List.Item.Detail.Metadata.Separator />
                    <List.Item.Detail.Metadata.Label title="Characters" text={String(stats.characters)} />
                    <List.Item.Detail.Metadata.Label title="Words" text={String(stats.words)} />
                    <List.Item.Detail.Metadata.Label title="Lines" text={String(stats.lines)} />
                  </List.Item.Detail.Metadata>
                }
              />
            }
          />
        );
      })}
      <List.EmptyView
        icon={Icon.Paragraph}
        title="No matching count"
        description="Type a count such as 3, 5p, 20w, or 8l."
      />
    </List>
  );
}

function OutputActions({
  content,
  action,
  onRegenerate,
}: {
  content: string;
  action: ReturnType<typeof getPrefs>["action"];
  onRegenerate: () => void;
}) {
  const labels = actionLabel(action);
  const copy = (
    <Action.CopyToClipboard title="Copy to Clipboard" content={content} shortcut="copy" />
  );
  const paste = (
    <Action.Paste title="Paste" content={content} shortcut={{ modifiers: ["cmd", "shift"], key: "v" }} />
  );
  const both = (
    <Action
      title="Paste and Copy"
      icon={Icon.CopyClipboard}
      shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }}
      onAction={() => produceOutput(content, "pasteAndCopy")}
    />
  );

  return (
    <ActionPanel>
      <ActionPanel.Section title={labels}>
        {action === "paste" ? (
          <>
            {paste}
            {copy}
            {both}
          </>
        ) : action === "pasteAndCopy" ? (
          <>
            {both}
            {copy}
            {paste}
          </>
        ) : (
          <>
            {copy}
            {paste}
            {both}
          </>
        )}
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action
          title="Regenerate"
          icon={Icon.ArrowClockwise}
          shortcut="refresh"
          onAction={onRegenerate}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );
}

function previewMarkdown(kind: Kind, text: string): string {
  if (kind === "html") return "```html\n" + text + "\n```";
  if (kind === "titles") return "# " + text;
  return text;
}

function plural(unit: string, count: number): string {
  return count === 1 ? unit : `${unit}s`;
}
