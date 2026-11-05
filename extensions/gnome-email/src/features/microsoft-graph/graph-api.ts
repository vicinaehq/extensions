import type { EmailAttachment, EmailMessage, GraphMailAccount, Mailbox } from "../../types";
import { graphCollection, graphRequest } from "./graph-client";

type GraphFolder = { id: string; displayName: string; childFolderCount?: number };
type GraphMessage = {
  id: string;
  internetMessageId?: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime?: string;
  isRead?: boolean;
  attachments?: Array<{ name?: string; contentType?: string; isInline?: boolean }>;
};

const MESSAGE_FIELDS = "id,internetMessageId,subject,from,receivedDateTime,isRead";
const MESSAGE_ATTACHMENTS = "&$expand=attachments($select=name,contentType,isInline)";

function attachments(message: GraphMessage): EmailAttachment[] {
  return (message.attachments ?? [])
    .filter((attachment) => !attachment.isInline)
    .map((attachment) => ({
      name: attachment.name || "Unnamed attachment",
      mimeType: attachment.contentType || "application/octet-stream",
    }));
}

function sender(message: GraphMessage): string {
  const address = message.from?.emailAddress?.address ?? "";
  const name = message.from?.emailAddress?.name ?? "";
  return name ? `${name}${address ? ` <${address}>` : ""}` : address || "Unknown sender";
}

function toEmailMessage(account: GraphMailAccount, mailboxPath: string, message: GraphMessage): EmailMessage {
  return {
    id: `${account.id}:${mailboxPath}:${message.id}`,
    accountId: account.id,
    accountName: account.name,
    accountEmail: account.email,
    remoteId: message.id,
    mailboxPath,
    messageId: message.internetMessageId,
    subject: message.subject || "(No subject)",
    from: sender(message),
    date: message.receivedDateTime ? new Date(message.receivedDateTime) : undefined,
    unread: !message.isRead,
    attachments: attachments(message),
  };
}

async function graphSpecialUse(account: GraphMailAccount): Promise<Map<string, string>> {
  const names: Array<[string, string]> = [
    ["inbox", "\\Inbox"],
    ["archive", "\\Archive"],
    ["drafts", "\\Drafts"],
    ["sentitems", "\\Sent"],
    ["deleteditems", "\\Trash"],
    ["junkemail", "\\Junk"],
  ];
  const folders = await Promise.allSettled(names.map(async ([name, use]) => {
    const folder = await graphRequest<GraphFolder>(account, `/me/mailFolders/${name}?$select=id`);
    return [folder.id, use] as const;
  }));
  return new Map(folders.flatMap((result) => result.status === "fulfilled" ? [result.value] : []));
}

async function graphFolderTree(
  account: GraphMailAccount,
  endpoint: string,
  prefix = "",
): Promise<Array<{ folder: GraphFolder; displayPath: string }>> {
  const folders = await graphCollection<GraphFolder>(account, endpoint);
  const results: Array<{ folder: GraphFolder; displayPath: string }> = [];
  for (const folder of folders) {
    const displayPath = prefix ? `${prefix} / ${folder.displayName}` : folder.displayName;
    results.push({ folder, displayPath });
    if (folder.childFolderCount) {
      results.push(...await graphFolderTree(
        account,
        `/me/mailFolders/${encodeURIComponent(folder.id)}/childFolders?$top=100&$select=id,displayName,childFolderCount`,
        displayPath,
      ));
    }
  }
  return results;
}

export async function getGraphMailboxes(account: GraphMailAccount): Promise<Mailbox[]> {
  const [folders, specialUses] = await Promise.all([
    graphFolderTree(account, "/me/mailFolders?includeHiddenFolders=true&$top=100&$select=id,displayName,childFolderCount"),
    graphSpecialUse(account),
  ]);
  return folders.map(({ folder, displayPath }) => ({
    accountId: account.id,
    path: folder.id,
    name: displayPath,
    specialUse: specialUses.get(folder.id),
  }));
}

export async function fetchGraphMailbox(
  account: GraphMailAccount,
  mailboxPath: string,
  limit = 50,
): Promise<EmailMessage[]> {
  const folder = encodeURIComponent(mailboxPath);
  const endpoint = `/me/mailFolders/${folder}/messages?$top=${limit}&$select=${MESSAGE_FIELDS}&$orderby=receivedDateTime%20desc${MESSAGE_ATTACHMENTS}`;
  const page = await graphRequest<{ value?: GraphMessage[] }>(account, endpoint);
  return (page.value ?? []).map((message) => toEmailMessage(account, mailboxPath, message));
}

export function fetchGraphInbox(account: GraphMailAccount, limit = 50): Promise<EmailMessage[]> {
  return fetchGraphMailbox(account, "inbox", limit);
}

export async function searchGraphMailbox(
  account: GraphMailAccount,
  mailboxPath: string,
  query: string,
  limit = 100,
): Promise<EmailMessage[]> {
  const folder = encodeURIComponent(mailboxPath);
  const escaped = query.replace(/"/g, "\\\"");
  const endpoint = `/me/mailFolders/${folder}/messages?$top=${limit}&$select=${MESSAGE_FIELDS}&$search=${encodeURIComponent(`"${escaped}"`)}${MESSAGE_ATTACHMENTS}`;
  const page = await graphRequest<{ value?: GraphMessage[] }>(account, endpoint);
  return (page.value ?? []).map((message) => toEmailMessage(account, mailboxPath, message));
}

export async function setGraphMessageReadState(account: GraphMailAccount, messageId: string, read: boolean): Promise<void> {
  await graphRequest(account, `/me/messages/${encodeURIComponent(messageId)}`, {
    method: "PATCH",
    body: JSON.stringify({ isRead: read }),
  });
}

export async function archiveGraphMessage(account: GraphMailAccount, messageId: string, archiveFolderId: string): Promise<void> {
  await graphRequest(account, `/me/messages/${encodeURIComponent(messageId)}/move`, {
    method: "POST",
    body: JSON.stringify({ destinationId: archiveFolderId }),
  });
}
