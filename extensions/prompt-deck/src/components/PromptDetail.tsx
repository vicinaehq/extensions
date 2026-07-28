import { Color, List } from "@vicinae/api";
import { CONTEXT_SOURCE_LABELS } from "../lib/context";
import { formatProvider } from "../lib/providers";
import { preview, trimText } from "../lib/string";
import type { LlmShortcut } from "../lib/types";

const Metadata = List.Item.Detail.Metadata;

/**
 * Side panel for a prompt in the manager list: what it says as markdown,
 * how it runs as metadata.
 */
export function PromptDetail({ shortcut }: { shortcut: LlmShortcut }) {
  return <List.Item.Detail markdown={buildDetailMarkdown(shortcut)} metadata={<PromptMetadata shortcut={shortcut} />} />;
}

/**
 * Prose half: what the prompt says.
 */
function buildDetailMarkdown(shortcut: LlmShortcut): string {
  const sections = [`# ${shortcut.name}`];
  const description = trimText(shortcut.description);

  if (description) {
    sections.push(`_${description}_`);
  }

  // Keywords live here rather than in the metadata so that area stays within
  // the ~5 rows it can display without clipping.
  const keywords = trimText(shortcut.alias);
  if (keywords) {
    sections.push(`**Keywords** — ${keywords}`);
  }

  sections.push("---");

  // Only ever render a real command here — "asks each time" is a run mode,
  // not command text, and belongs in the metadata instead.
  const command = trimText(shortcut.defaultCommand);
  if (command) {
    sections.push(`**Command**\n\n${command}`);
  }

  sections.push(`**System Prompt**\n\n${preview(shortcut.systemPrompt, 400)}`);

  return sections.join("\n\n");
}

/**
 * Structured half: how the prompt runs.
 *
 * The metadata area clips rather than scrolls, so this is deliberately capped:
 * provider and model share one row, and the three numeric overrides collapse
 * into a single tag row, keeping a fully configured prompt within ~5 rows.
 */
function PromptMetadata({ shortcut }: { shortcut: LlmShortcut }) {
  const overrides = buildOverrideTags(shortcut);

  return (
    <Metadata>
      <Metadata.TagList title="Run Mode">
        {trimText(shortcut.defaultCommand) ? (
          <Metadata.TagList.Item text="Runs instantly" color={Color.Green} />
        ) : (
          <Metadata.TagList.Item text="Asks for a command" color={Color.Orange} />
        )}
      </Metadata.TagList>
      <Metadata.TagList title="Context">
        {shortcut.contextSources.length ? (
          shortcut.contextSources.map((source) => (
            <Metadata.TagList.Item key={source} text={CONTEXT_SOURCE_LABELS[source]} color={Color.Blue} />
          ))
        ) : (
          <Metadata.TagList.Item text="None" color={Color.SecondaryText} />
        )}
      </Metadata.TagList>
      <Metadata.Separator />
      <Metadata.Label title="Model" text={formatModelSummary(shortcut)} />
      {overrides.length ? (
        <Metadata.TagList title="Overrides">
          {overrides.map((override) => (
            <Metadata.TagList.Item key={override} text={override} color={Color.Purple} />
          ))}
        </Metadata.TagList>
      ) : null}
    </Metadata>
  );
}

function formatModelSummary(shortcut: LlmShortcut): string {
  if (!shortcut.provider && !shortcut.model) {
    return "Extension default";
  }

  return [shortcut.provider ? formatProvider(shortcut.provider) : "Default provider", shortcut.model ?? "default model"].join(" · ");
}

function buildOverrideTags(shortcut: LlmShortcut): string[] {
  const tags: string[] = [];

  if (shortcut.temperature !== undefined) {
    tags.push(`temp ${shortcut.temperature}`);
  }
  if (shortcut.reasoningLevel) {
    tags.push(`${shortcut.reasoningLevel} reasoning`);
  }
  if (shortcut.maxOutputTokens !== undefined) {
    tags.push(`${shortcut.maxOutputTokens} tokens`);
  }

  return tags;
}
