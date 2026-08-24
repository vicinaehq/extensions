import { Action, ActionPanel, Icon, showToast, Toast } from "@vicinae/api";
import { errorMessage } from "../../lib/errors";
import { clearEmailCaches } from "../cache/email-cache";
import { archiveMessage, setMessageReadState } from "./message-service";
import type { EmailMessage, GoaMailAccount } from "../../types";
import { emailAppActionTitle, openInDefaultEmailApp, type EmailAppTarget } from "./default-email-app";

import { MessageDetail } from "./message-detail";

type MessageActionsProps = {
  account: GoaMailAccount;
  message: EmailMessage;
  showImages: boolean;
  maxMessageSizeMb: number;
  emailAppTarget: EmailAppTarget;
  readOnlyMode: boolean;
  onReadStateChange: (unread: boolean) => void;
  archiveMailboxPath?: string;
  onArchived: () => void;
  onReload: () => void;
};

export function MessageActions({
  account,
  message,
  showImages,
  maxMessageSizeMb,
  emailAppTarget,
  readOnlyMode,
  onReadStateChange,
  archiveMailboxPath,
  onArchived,
  onReload,
}: MessageActionsProps) {
  const archive = async () => {
    if (!archiveMailboxPath) {
      await showToast({ style: Toast.Style.Failure, title: "Could not archive message", message: "This account has no Archive mailbox." });
      return;
    }
    try {
      await archiveMessage(account, message.mailboxPath, message.remoteId, archiveMailboxPath);
      onArchived();
      await showToast({ style: Toast.Style.Success, title: "Message archived" });
    } catch (cause) {
      await showToast({ style: Toast.Style.Failure, title: "Could not archive message", message: errorMessage(cause) });
    }
  };

  const clearCaches = async () => {
    try {
      await clearEmailCaches();
      await showToast({ style: Toast.Style.Success, title: "Message and image cache cleared" });
    } catch (cause) {
      await showToast({ style: Toast.Style.Failure, title: "Could not clear cache", message: errorMessage(cause) });
    }
  };

  const toggleReadState = async () => {
    const read = message.unread;
    try {
      await setMessageReadState(account, message.mailboxPath, message.remoteId, read);
      onReadStateChange(!read);
      await showToast({ style: Toast.Style.Success, title: read ? "Marked as read" : "Marked as unread" });
    } catch (cause) {
      await showToast({ style: Toast.Style.Failure, title: "Could not update message", message: errorMessage(cause) });
    }
  };

  return (
    <ActionPanel>
      <Action.Push
        title="Show Message"
        icon={Icon.Eye}
        shortcut={{ modifiers: [], key: "enter" }}
        target={
          <MessageDetail
            account={account}
            message={message}
            showImages={showImages}
            maxMessageSizeMb={maxMessageSizeMb}
            emailAppTarget={emailAppTarget}
          />
        }
      />
      <Action
        title={emailAppActionTitle(emailAppTarget)}
        icon={Icon.Envelope}
        shortcut={{ modifiers: ["shift"], key: "enter" }}
        onAction={() => { void openInDefaultEmailApp(message, emailAppTarget); }}
      />
      {!readOnlyMode ? (
        <Action title="Archive" icon={Icon.Box} shortcut={{ modifiers: ["ctrl"], key: "a" }} onAction={() => { void archive(); }} />
      ) : null}
      {!readOnlyMode ? (
        <Action
          title={message.unread ? "Mark as Read" : "Mark as Unread"}
          icon={message.unread ? Icon.CheckCircle : Icon.Envelope}
          shortcut={{ modifiers: ["ctrl"], key: "r" }}
          onAction={() => { void toggleReadState(); }}
        />
      ) : null}
      <Action title="Reload" icon={Icon.ArrowClockwise} onAction={onReload} />
      <Action title="Clear Message and Image Cache" icon={Icon.Trash} onAction={() => { void clearCaches(); }} />
      <Action.CopyToClipboard title="Copy Subject" content={message.subject} />
      <Action.CopyToClipboard title="Copy Sender" content={message.from} />
    </ActionPanel>
  );
}
