import type { FetchMessageObject, MessageStructureObject } from "imapflow";
import { createImapClient } from "../../lib/imap-client";
import type { EmailAttachment, EmailMessage, ImapMailAccount, Mailbox } from "../../types";

function formatAddress(message: FetchMessageObject): string {
  const sender = message.envelope?.from?.[0];
  if (!sender) return "Unknown sender";
  const address = sender.address ?? "";
  return sender.name ? `${sender.name}${address ? ` <${address}>` : ""}` : address || "Unknown sender";
}

function attachmentsFromStructure(structure?: MessageStructureObject): EmailAttachment[] {
  if (!structure) return [];
  const children = structure.childNodes?.flatMap(attachmentsFromStructure) ?? [];
  const disposition = structure.disposition?.toLowerCase();
  const name = structure.dispositionParameters?.filename ?? structure.parameters?.name;
  const attachment = disposition === "attachment" || (Boolean(name) && disposition !== "inline");
  return attachment
    ? [{ name: name || "Unnamed attachment", mimeType: structure.type || "application/octet-stream" }, ...children]
    : children;
}

function toEmailMessage(account: ImapMailAccount, mailboxPath: string, message: FetchMessageObject): EmailMessage {
  return {
    id: `${account.id}:${mailboxPath}:${message.uid}`,
    accountId: account.id,
    accountName: account.name,
    accountEmail: account.email,
    remoteId: String(message.uid),
    mailboxPath,
    messageId: message.envelope?.messageId,
    subject: message.envelope?.subject || "(No subject)",
    from: formatAddress(message),
    date: message.envelope?.date,
    unread: !message.flags?.has("\\Seen"),
    attachments: attachmentsFromStructure(message.bodyStructure),
  };
}

export async function getImapMailboxes(account: ImapMailAccount): Promise<Mailbox[]> {
  const client = await createImapClient(account);
  try {
    await client.connect();
    const mailboxes = await client.list();

    return mailboxes
      .filter((mailbox) => !mailbox.flags.has("\\Noselect"))
      .map((mailbox) => ({ accountId: account.id, path: mailbox.path, name: mailbox.name, specialUse: mailbox.specialUse }));
  } finally {
    await client.logout().catch(() => undefined);
  }
}

export async function fetchImapMailbox(
  account: ImapMailAccount,
  mailboxPath: string,
  readOnly = true,
  limit = 50,
): Promise<EmailMessage[]> {
  const client = await createImapClient(account);

  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailboxPath, { readOnly });

    try {
      const exists = client.mailbox && typeof client.mailbox !== "boolean" ? client.mailbox.exists : 0;
      if (!exists) return [];

      const start = Math.max(1, exists - limit + 1);
      const messages: EmailMessage[] = [];

      for await (const message of client.fetch(`${start}:*`, { envelope: true, flags: true, uid: true, bodyStructure: true })) {
        messages.push(toEmailMessage(account, mailboxPath, message));
      }

      return messages;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
}

export function fetchImapInbox(account: ImapMailAccount, readOnly = true, limit = 50): Promise<EmailMessage[]> {
  return fetchImapMailbox(account, "INBOX", readOnly, limit);
}

export async function searchImapMailbox(
  account: ImapMailAccount,
  mailboxPath: string,
  query: string,
  limit = 100,
): Promise<EmailMessage[]> {
  const client = await createImapClient(account);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailboxPath, { readOnly: true });
    try {
      const matches = await client.search({ text: query }, { uid: true });
      if (!matches || !matches.length) return [];

      const uids = matches.slice(-limit);
      const messages: EmailMessage[] = [];
      for await (const message of client.fetch(uids.join(","), { envelope: true, flags: true, uid: true, bodyStructure: true }, { uid: true })) {
        messages.push(toEmailMessage(account, mailboxPath, message));
      }
      return messages;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
}
