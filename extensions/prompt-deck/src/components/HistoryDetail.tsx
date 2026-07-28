import { ActionPanel, Detail, Icon } from "@vicinae/api";
import { SHORTCUT_PASTE } from "../lib/constants";
import { buildHistoryMarkdown, findLatestMessage } from "../lib/prompt";
import type { ShortcutRun } from "../lib/types";
import { CopyAction } from "./CopyAction";
import { PasteAction } from "./PasteAction";

interface HistoryDetailProps {
  run: ShortcutRun;
}

/**
 * Read-only detail view for a saved prompt run.
 */
export function HistoryDetail({ run }: HistoryDetailProps) {
  const markdown = buildHistoryMarkdown(run);
  const answer = findLatestMessage(run.messages, "assistant", true)?.content;

  return (
    <Detail
      navigationTitle={run.shortcutName}
      markdown={markdown}
      actions={
        <ActionPanel>
          {answer ? (
            <CopyAction
              title="Copy"
              icon={Icon.CopyClipboard}
              content={answer}
              closeWindowOnCopy={run.closeWindowOnCopy ?? false}
            />
          ) : null}
          {answer ? <PasteAction title="Paste to Active App" content={answer} shortcut={SHORTCUT_PASTE} /> : null}
          <CopyAction
            title="Copy Initial Command"
            icon={Icon.Text}
            content={run.command}
            closeWindowOnCopy={run.closeWindowOnCopy ?? false}
          />
          <CopyAction title="Copy Full Chat" icon={Icon.Text} content={markdown} closeWindowOnCopy={run.closeWindowOnCopy ?? false} />
        </ActionPanel>
      }
    />
  );
}
