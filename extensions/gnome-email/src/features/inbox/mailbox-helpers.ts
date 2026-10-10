import type { Mailbox } from "../../types";

export const ALL_INBOXES = "all-inboxes";

export function mailboxValue(mailbox: Mailbox): string {
  return `${encodeURIComponent(mailbox.accountId)}:${encodeURIComponent(mailbox.path)}`;
}

export function findArchiveMailbox(mailboxes: Mailbox[], accountId: string): Mailbox | undefined {
  const accountMailboxes = mailboxes.filter((mailbox) => mailbox.accountId === accountId);
  return accountMailboxes.find((mailbox) => mailbox.specialUse === "\\Archive")
    ?? accountMailboxes.find((mailbox) => mailbox.specialUse === "\\All")
    ?? accountMailboxes.find((mailbox) => {
      const name = mailbox.name.toLowerCase();
      const path = mailbox.path.toLowerCase();
      return name === "archive" || path === "archive" || name === "all mail" || path.endsWith("/all mail");
    });
}
