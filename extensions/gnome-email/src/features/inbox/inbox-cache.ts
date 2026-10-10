import { Cache } from "@vicinae/api";
import type { EmailMessage, GoaMailAccount, Mailbox } from "../../types";

export type InboxCacheSnapshot = {
  accounts: GoaMailAccount[];
  mailboxes: Mailbox[];
  messages: EmailMessage[];
  updatedAt: Date;
};

type SerializedSnapshot = Omit<InboxCacheSnapshot, "messages" | "updatedAt"> & {
  messages: Array<Omit<EmailMessage, "date"> & { date?: string }>;
  updatedAt: string;
};

const cache = new Cache({ namespace: "all-inboxes", capacity: 5 * 1024 * 1024 });
const SNAPSHOT_KEY = "snapshot-v1";

export function loadInboxCache(): InboxCacheSnapshot | undefined {
  const serialized = cache.get(SNAPSHOT_KEY);
  if (!serialized) return undefined;

  try {
    const parsed = JSON.parse(serialized) as SerializedSnapshot;
    if (!Array.isArray(parsed.accounts) || !Array.isArray(parsed.mailboxes) || !Array.isArray(parsed.messages)) return undefined;
    return {
      accounts: parsed.accounts,
      mailboxes: parsed.mailboxes,
      messages: parsed.messages.map((message) => ({
        ...message,
        date: message.date ? new Date(message.date) : undefined,
        attachments: Array.isArray(message.attachments) ? message.attachments : [],
      })),
      updatedAt: new Date(parsed.updatedAt),
    };
  } catch {
    cache.remove(SNAPSHOT_KEY);
    return undefined;
  }
}

export function saveInboxCache(snapshot: Omit<InboxCacheSnapshot, "updatedAt">): void {
  cache.set(SNAPSHOT_KEY, JSON.stringify({ ...snapshot, updatedAt: new Date().toISOString() }));
}

export function clearInboxCache(): void {
  cache.remove(SNAPSHOT_KEY);
}
