import { createImapClient } from "../../lib/imap-client";
import type { ImapMailAccount } from "../../types";

export async function archiveImapMessage(
  account: ImapMailAccount,
  mailboxPath: string,
  remoteId: string,
  archiveMailboxPath: string,
): Promise<void> {
  const client = await createImapClient(account);

  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailboxPath);

    try {
      await client.messageMove(Number(remoteId), archiveMailboxPath, { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
}

export async function setImapMessageReadState(
  account: ImapMailAccount,
  mailboxPath: string,
  remoteId: string,
  read: boolean,
): Promise<void> {
  const client = await createImapClient(account);

  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailboxPath);

    try {
      if (read) {
        await client.messageFlagsAdd(Number(remoteId), ["\\Seen"], { uid: true });
      } else {
        await client.messageFlagsRemove(Number(remoteId), ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
}
