import { Action, ActionPanel, Detail, Icon, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { errorMessage } from "../../lib/errors";
import { fetchMessageBody } from "./message-service";
import type { EmailMessage, GoaMailAccount } from "../../types";
import { attachmentIcon } from "./attachment-icon";
import { emailAppActionTitle, openInDefaultEmailApp, type EmailAppTarget } from "./default-email-app";
import { escapeMarkdown, hideMarkdownImages } from "./markdown-safety";

type MessageDetailProps = {
  account: GoaMailAccount;
  message: EmailMessage;
  showImages: boolean;
  maxMessageSizeMb: number;
  emailAppTarget: EmailAppTarget;
};

export function MessageDetail({ account, message, showImages, maxMessageSizeMb, emailAppTarget }: MessageDetailProps) {
  const [body, setBody] = useState<string>();
  const [showImagesForMessage, setShowImagesForMessage] = useState(false);
  const shouldShowImages = showImages || showImagesForMessage;

  useEffect(() => {
    let active = true;

    setBody(undefined);
    const loadBody = async () => {
      const toastPromise = showToast({ style: Toast.Style.Animated, title: "Loading message body…" })
        .catch(() => undefined);
      try {
        const content = await fetchMessageBody(
          account,
          message.mailboxPath,
          message.remoteId,
          shouldShowImages,
          maxMessageSizeMb * 1024 * 1024,
        );
        if (active) setBody(shouldShowImages ? content : hideMarkdownImages(content));
      } catch (cause) {
        if (active) setBody(`_Could not load message body: ${errorMessage(cause)}_`);
      } finally {
        await (await toastPromise)?.hide();
      }
    };

    void loadBody();
    return () => { active = false; };
  }, [account, maxMessageSizeMb, message.mailboxPath, message.remoteId, shouldShowImages]);

  return (
    <Detail
      navigationTitle={message.subject}
      markdown={`# ${escapeMarkdown(message.subject)}\n\n**From:** ${escapeMarkdown(message.from)}\n\n**Account:** ${escapeMarkdown(message.accountEmail)}\n\n**Date:** ${escapeMarkdown(message.date?.toLocaleString() ?? "Unknown")}\n\n---\n\n${body ?? "_Loading message body…_"}`}
      metadata={
        message.attachments.length ? (
          <Detail.Metadata>
            <Detail.Metadata.Label title="Attachments" text={String(message.attachments.length)} icon={Icon.Paperclip} />
            <Detail.Metadata.Separator />
            {message.attachments.map((attachment, index) => (
              <Detail.Metadata.Label
                key={`${attachment.name}:${index}`}
                title={attachment.name}
                text={attachment.mimeType}
                icon={attachmentIcon(attachment.mimeType)}
              />
            ))}
          </Detail.Metadata>
        ) : undefined
      }
      actions={
        <ActionPanel>
          <Action
            title={emailAppActionTitle(emailAppTarget)}
            icon={Icon.Envelope}
            shortcut={{ modifiers: [], key: "enter" }}
            onAction={() => { void openInDefaultEmailApp(message, emailAppTarget); }}
          />
          {!showImages && !showImagesForMessage ? (
            <Action
              title="Show Images for This Email Only"
              icon={Icon.Eye}
              onAction={() => { setShowImagesForMessage(true); }}
            />
          ) : null}
          <Action.CopyToClipboard title="Copy Subject" content={message.subject} />
          <Action.CopyToClipboard title="Copy Sender" content={message.from} />
        </ActionPanel>
      }
    />
  );
}
