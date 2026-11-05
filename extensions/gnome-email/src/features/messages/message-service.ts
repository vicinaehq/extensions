import type { GoaMailAccount } from "../../types";
import {
  archiveGraphMessage,
  setGraphMessageReadState,
} from "../microsoft-graph/graph-api";
import { fetchGraphMessageBody } from "../microsoft-graph/graph-body";
import { archiveImapMessage, setImapMessageReadState } from "./message-api";
import { fetchImapMessageBody } from "./message-body";

export function archiveMessage(
  account: GoaMailAccount,
  mailboxPath: string,
  remoteId: string,
  archiveMailboxPath: string,
): Promise<void> {
  return account.backend === "microsoft-graph"
    ? archiveGraphMessage(account, remoteId, archiveMailboxPath)
    : archiveImapMessage(account, mailboxPath, remoteId, archiveMailboxPath);
}

export function setMessageReadState(
  account: GoaMailAccount,
  mailboxPath: string,
  remoteId: string,
  read: boolean,
): Promise<void> {
  return account.backend === "microsoft-graph"
    ? setGraphMessageReadState(account, remoteId, read)
    : setImapMessageReadState(account, mailboxPath, remoteId, read);
}

export function fetchMessageBody(
  account: GoaMailAccount,
  mailboxPath: string,
  remoteId: string,
  showImages: boolean,
  maxSourceBytes: number,
): Promise<string> {
  return account.backend === "microsoft-graph"
    ? fetchGraphMessageBody(account, remoteId, showImages, maxSourceBytes)
    : fetchImapMessageBody(account, mailboxPath, remoteId, showImages, maxSourceBytes);
}
