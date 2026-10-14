import type { EmailMessage, GoaMailAccount, Mailbox } from "../../types";
import {
  fetchGraphInbox,
  fetchGraphMailbox,
  getGraphMailboxes,
  searchGraphMailbox,
} from "../microsoft-graph/graph-api";
import {
  fetchImapInbox,
  fetchImapMailbox,
  getImapMailboxes,
  searchImapMailbox,
} from "./mailbox-api";

export function getMailboxes(account: GoaMailAccount): Promise<Mailbox[]> {
  return account.backend === "microsoft-graph" ? getGraphMailboxes(account) : getImapMailboxes(account);
}

export function fetchInbox(account: GoaMailAccount, readOnly = true, limit = 50): Promise<EmailMessage[]> {
  return account.backend === "microsoft-graph"
    ? fetchGraphInbox(account, limit)
    : fetchImapInbox(account, readOnly, limit);
}

export function fetchMailbox(
  account: GoaMailAccount,
  mailboxPath: string,
  readOnly = true,
  limit = 50,
): Promise<EmailMessage[]> {
  return account.backend === "microsoft-graph"
    ? fetchGraphMailbox(account, mailboxPath, limit)
    : fetchImapMailbox(account, mailboxPath, readOnly, limit);
}

export function searchMailbox(
  account: GoaMailAccount,
  mailboxPath: string,
  query: string,
  limit = 100,
): Promise<EmailMessage[]> {
  return account.backend === "microsoft-graph"
    ? searchGraphMailbox(account, mailboxPath, query, limit)
    : searchImapMailbox(account, mailboxPath, query, limit);
}
