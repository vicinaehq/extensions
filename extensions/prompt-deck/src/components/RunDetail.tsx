import { Action, ActionPanel, Detail, Icon, openExtensionPreferences } from "@vicinae/api";
import type { ReactNode } from "react";
import { SHORTCUT_COPY, SHORTCUT_PASTE, SHORTCUT_REPLY } from "../lib/constants";
import { buildChatMarkdown, buildCurrentTurnMarkdown, findLatestMessage } from "../lib/prompt";
import { formatProvider } from "../lib/providers";
import type { ChatMessage, ContextBlock, ProviderType } from "../lib/types";
import { CopyAction } from "./CopyAction";
import { PasteAction } from "./PasteAction";

interface RunDetailProps {
  shortcutName: string;
  contextBlocks: ContextBlock[];
  messages: ChatMessage[];
  provider?: ProviderType | undefined;
  model?: string | undefined;
  error?: string | undefined;
  isStreaming?: boolean | undefined;
  closeWindowOnCopy?: boolean | undefined;
  /** Promotes Paste above Copy so Enter sends the answer to the active app. */
  pasteToActiveApp?: boolean | undefined;
  replyTarget?: ReactNode | undefined;
  fullChatReplyTarget?: ReactNode | undefined;
  /** Shown alongside errors: reopens the command form with the failed command prefilled. */
  retryTarget?: ReactNode | undefined;
}

/**
 * Markdown chat transcript for an executed prompt.
 */
export function RunDetail({
  shortcutName,
  contextBlocks,
  messages,
  provider,
  model,
  error,
  isStreaming,
  closeWindowOnCopy,
  pasteToActiveApp,
  replyTarget,
  fullChatReplyTarget,
  retryTarget,
}: RunDetailProps) {
  const markdown = buildCurrentTurnMarkdown({
    messages,
    ...(error ? { error } : {}),
    ...(isStreaming === undefined ? {} : { isStreaming }),
  });
  const latestAssistant = findLatestMessage(messages, "assistant", true);
  const modelLabel = [provider ? formatProvider(provider) : undefined, model].filter(Boolean).join(" · ");

  return (
    <Detail
      navigationTitle={modelLabel ? `${shortcutName} (${modelLabel})` : shortcutName}
      markdown={markdown}
      actions={
        <ActionPanel>
          {latestAssistant
            ? orderResultActions(
                pasteToActiveApp,
                <PasteAction
                  key="paste"
                  title="Paste to Active App"
                  content={latestAssistant.content}
                  shortcut={SHORTCUT_PASTE}
                />,
                <CopyAction
                  key="copy"
                  title="Copy"
                  icon={Icon.CopyClipboard}
                  content={latestAssistant.content}
                  closeWindowOnCopy={closeWindowOnCopy}
                  shortcut={SHORTCUT_COPY}
                />,
              )
            : null}
          {replyTarget && !isStreaming ? (
            <Action.Push title="Reply" icon={Icon.Reply} target={replyTarget} shortcut={SHORTCUT_REPLY} />
          ) : null}
          {error && retryTarget ? (
            <Action.Push title="Edit Command & Retry" icon={Icon.ArrowClockwise} target={retryTarget} />
          ) : null}
          {error ? (
            <Action title="Open Extension Preferences" icon={Icon.Cog} onAction={openExtensionPreferences} />
          ) : null}
          {messages.length ? (
            <Action.Push
              title="Open Full Chat"
              icon={Icon.SpeechBubble}
              target={
                <FullChatDetail
                  shortcutName={shortcutName}
                  contextBlocks={contextBlocks}
                  messages={messages}
                  provider={provider}
                  model={model}
                  error={error}
                  closeWindowOnCopy={closeWindowOnCopy}
                  replyTarget={fullChatReplyTarget}
                />
              }
            />
          ) : null}
        </ActionPanel>
      }
    />
  );
}

/**
 * The first action in a Vicinae ActionPanel is what Enter triggers, so prompts
 * configured to paste put Paste ahead of Copy.
 */
function orderResultActions(pasteFirst: boolean | undefined, paste: ReactNode, copy: ReactNode): ReactNode[] {
  return pasteFirst ? [paste, copy] : [copy, paste];
}

function FullChatDetail({ shortcutName, contextBlocks, messages, provider, model, error, closeWindowOnCopy, replyTarget }: RunDetailProps) {
  const markdown = buildChatMarkdown({
    contextBlocks,
    messages,
    ...(error ? { error } : {}),
  });
  const latestAssistant = findLatestMessage(messages, "assistant", true);
  const modelLabel = [provider ? formatProvider(provider) : undefined, model].filter(Boolean).join(" · ");

  return (
    <Detail
      navigationTitle={modelLabel ? `${shortcutName} Chat (${modelLabel})` : `${shortcutName} Chat`}
      markdown={markdown}
      actions={
        <ActionPanel>
          {replyTarget ? <Action.Push title="Reply" icon={Icon.Reply} target={replyTarget} shortcut={SHORTCUT_REPLY} /> : null}
          {latestAssistant ? (
            <CopyAction
              title="Copy"
              icon={Icon.CopyClipboard}
              content={latestAssistant.content}
              closeWindowOnCopy={closeWindowOnCopy}
              shortcut={SHORTCUT_COPY}
            />
          ) : null}
          <CopyAction title="Copy Full Chat" icon={Icon.Text} content={markdown} closeWindowOnCopy={closeWindowOnCopy} />
        </ActionPanel>
      }
    />
  );
}
