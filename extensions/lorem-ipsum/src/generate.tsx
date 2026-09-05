import { useEffect, useMemo, useState } from "react";
import { Action, ActionPanel, Cache, Clipboard, closeMainWindow, getFrontmostApplication, Icon, List, type Application } from "@vicinae/api";
import { generate, generateUntilCharacters, textStats, type Kind, type ListStyle } from "./lib/generator";
import { getPrefs } from "./lib/output";
import { isKind, parseQuery, stripKindSuffix } from "./lib/parse";

const LAST_KIND_KEY = "lastKind";
const kindCache = new Cache({ namespace: "generate" });

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

function readLastKind(): Kind {
  const stored = kindCache.get(LAST_KIND_KEY);
  return stored && isKind(stored) ? stored : "paragraphs";
}

function writeLastKind(kind: Kind) {
  kindCache.set(LAST_KIND_KEY, kind);
}

export default function GenerateCommand() {
  const { startWithLorem, listStyle, htmlTag } = getPrefs();
  const [kind, setKind] = useState<Kind>(readLastKind);
  const [query, setQuery] = useState("");
  const [generation, setGeneration] = useState(0);

  const parsed = parseQuery(query);
  const charBudget = parsed.characters ? parsed.count : undefined;
  const activeKind = parsed.kind ?? kind;
  const meta = charBudget
    ? { title: "Characters", icon: Icon.Text, unit: "character" }
    : (KINDS.find((item) => item.id === activeKind) ?? KINDS[0]);

  const selectKind = (next: Kind) => {
    setKind(next);
    writeLastKind(next);
  };

  const counts = useMemo(() => {
    if (charBudget) return [charBudget];
    if (parsed.count) return [parsed.count];
    return PRESETS[activeKind];
  }, [activeKind, charBudget, parsed.count]);

  const items = useMemo(
    () =>
      counts.map((count) => ({
        id: charBudget ? `characters-${count}` : `${activeKind}-${count}`,
        count,
        text: charBudget
          ? generateUntilCharacters(count, startWithLorem)
          : generate({ kind: activeKind, count, startWithLorem, listStyle, htmlTag }),
      })),
    [activeKind, charBudget, counts, generation, htmlTag, listStyle, startWithLorem],
  );

  return (
    <List
      isShowingDetail
      searchText={query}
      searchBarPlaceholder="Count — 3, 5p, 20w, 120c"
      onSearchTextChange={(value) => {
        setQuery(value);
        const next = parseQuery(value);
        if (next.kind) selectKind(next.kind);
      }}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Type"
          value={kind}
          onChange={(value) => {
            selectKind(value as Kind);
            setQuery(stripKindSuffix(query));
          }}
        >
          {KINDS.map((item) => (
            <List.Dropdown.Item key={item.id} title={item.title} value={item.id} icon={item.icon} />
          ))}
        </List.Dropdown>
      }
    >
      {items.map((item) => {
        const stats = textStats(item.text);
        const label = `${item.count} ${plural(meta.unit, item.count)}`;

        return (
          <List.Item
            key={item.id}
            title={label}
            icon={meta.icon}
            actions={<OutputActions content={item.text} onRegenerate={() => setGeneration((n) => n + 1)} />}
            detail={
              <List.Item.Detail
                markdown={previewMarkdown(charBudget ? "words" : activeKind, item.text, listStyle)}
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
    </List>
  );
}

function OutputActions({
  content,
  onRegenerate,
}: {
  content: string;
  onRegenerate: () => void;
}) {
  const [app, setApp] = useState<Application | undefined>();

  useEffect(() => {
    getFrontmostApplication()
      .then(setApp)
      .catch(() => {});
  }, []);

  return (
    <ActionPanel>
      <Action
        title={app ? `Paste to ${app.name}` : "Paste to active window"}
        icon={app?.icon ?? (app?.path ? { fileIcon: app.path } : Icon.CopyClipboard)}
        onAction={async () => {
          await closeMainWindow();
          await Clipboard.paste(content);
        }}
      />
      <Action.CopyToClipboard content={content} shortcut="copy" />
      <Action
        title="Regenerate"
        icon={Icon.ArrowClockwise}
        shortcut="refresh"
        onAction={onRegenerate}
      />
    </ActionPanel>
  );
}

function previewMarkdown(kind: Kind, text: string, listStyle: ListStyle): string {
  if (kind === "html" || (kind === "list" && listStyle === "html")) return "```html\n" + text + "\n```";
  if (kind === "titles") return "# " + text;
  return text;
}

function plural(unit: string, count: number): string {
  return count === 1 ? unit : `${unit}s`;
}
