import { getPreferenceValues } from "@vicinae/api";
import { ImapFlow } from "imapflow";
import { getCredentials } from "../goa";
import type { ImapMailAccount, Preferences } from "../types";

function isLoopback(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === "localhost" || normalized === "::1" || normalized.startsWith("127.");
}

export async function createImapClient(account: ImapMailAccount): Promise<ImapFlow> {
  const credentials = await getCredentials(account);
  const { allowInsecureLoopbackTls } = getPreferenceValues<Preferences>();
  return new ImapFlow({
    host: account.host,
    port: account.port,
    secure: account.secure,
    doSTARTTLS: account.startTls,
    auth: { user: account.user, ...credentials },
    tls: { rejectUnauthorized: !(isLoopback(account.host) && allowInsecureLoopbackTls) },
    logger: false,
  });
}
