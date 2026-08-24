import type { Mailbox } from "../../types";

export const ALL_INBOXES = "all-inboxes";

export function mailboxValue(mailbox: Mailbox): string {
  return `${encodeURIComponent(mailbox.accountId)}:${encodeURIComponent(mailbox.path)}`;
}

export function findArchiveMailbox(mailboxes: Mailbox[], accountId: string): Mailbox | undefined {
  const accountMailboxes = mailboxes.filter((mailbox) => mailbox.accountId === accountId);
  return accountMailboxes.find((mailbox) => mailbox.specialUse === "\\Archive")
    ?? accountMailboxes.find((mailbox) => mailbox.name.toLowerCase() === "archive" || mailbox.path.toLowerCase() === "archive");
}
