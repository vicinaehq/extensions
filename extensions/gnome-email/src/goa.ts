import { sessionBus, type Variant } from "dbus-next";
import type { GoaMailAccount } from "./types";

const SERVICE = "org.gnome.OnlineAccounts";
const ROOT_PATH = "/org/gnome/OnlineAccounts";
const ACCOUNT = "org.gnome.OnlineAccounts.Account";
const MAIL = "org.gnome.OnlineAccounts.Mail";

type Properties = Record<string, Variant>;
type ManagedObjects = Record<string, Record<string, Properties>>;
type CallableInterface = { [method: string]: (...args: unknown[]) => Promise<unknown> };


function value<T>(properties: Properties, name: string, fallback: T): T {
  return (properties[name]?.value as T | undefined) ?? fallback;
}

function parseImapEndpoint(rawHost: string, configuredPort: number, secure: boolean): { host: string; port: number } {
  const input = rawHost.trim();
  const fallbackPort = configuredPort || (secure ? 993 : 143);

  /** Some GOA providers store the server as a URI even though the property is named ImapHost. */
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(input)) {
    const endpoint = new URL(input);
    return { host: endpoint.hostname, port: endpoint.port ? Number(endpoint.port) : fallbackPort };
  }

  /** Bracketed IPv6 with an optional port, for example [::1]:1144. */
  const bracketed = input.match(/^\[([^\]]+)](?::(\d+))?$/);
  if (bracketed) {
    return { host: bracketed[1], port: bracketed[2] ? Number(bracketed[2]) : fallbackPort };
  }

  /** GOA custom IMAP accounts may expose host and port together (Proton Bridge does this). */
  const hostAndPort = input.match(/^(.+):(\d+)$/);
  if (hostAndPort && !hostAndPort[1].includes(":")) {
    return { host: hostAndPort[1].trim(), port: Number(hostAndPort[2]) };
  }

  return { host: input, port: fallbackPort };
}

export async function getMailAccounts(): Promise<GoaMailAccount[]> {
  const bus = sessionBus();
  try {
    const root = await bus.getProxyObject(SERVICE, ROOT_PATH);
    const manager = root.getInterface("org.freedesktop.DBus.ObjectManager") as unknown as CallableInterface;
    const objects = (await manager.GetManagedObjects()) as ManagedObjects;

    return Object.entries(objects).flatMap<GoaMailAccount>(([path, interfaces]) => {
      const account = interfaces[ACCOUNT];
      const mail = interfaces[MAIL];
      if (!account || !mail || value(account, "MailDisabled", false)) return [];

      const email = value<string>(mail, "EmailAddress", "");
      if (!email) return [];

      const base = {
        path,
        id: value<string>(account, "Id", path),
        name: value<string>(account, "PresentationIdentity", email),
        email,
      };
      if (value<string>(account, "ProviderType", "") === "ms_graph") {
        return [{ ...base, backend: "microsoft-graph" as const }];
      }

      const host = value<string>(mail, "ImapHost", "");
      if (!host || !value(mail, "ImapSupported", true)) return [];
      const secure = value(mail, "ImapUseSsl", true);
      const endpoint = parseImapEndpoint(host, value(mail, "ImapPort", secure ? 993 : 143), secure);

      return [{
        ...base,
        backend: "imap" as const,
        host: endpoint.host,
        user: value<string>(mail, "ImapUserName", email),
        port: endpoint.port,
        secure,
        startTls: value(mail, "ImapUseTls", false),
      }];
    });
  } finally {
    bus.disconnect();
  }
}

export async function getCredentials(account: GoaMailAccount): Promise<{ accessToken?: string; pass?: string }> {
  const bus = sessionBus();
  try {
    const object = await bus.getProxyObject(SERVICE, account.path);

    if (object.interfaces["org.gnome.OnlineAccounts.OAuth2Based"]) {
      const oauth = object.getInterface("org.gnome.OnlineAccounts.OAuth2Based") as unknown as CallableInterface;
      const result = (await oauth.GetAccessToken()) as [string, bigint];
      return { accessToken: result[0] };
    }

    if (object.interfaces["org.gnome.OnlineAccounts.PasswordBased"]) {
      const password = object.getInterface("org.gnome.OnlineAccounts.PasswordBased") as unknown as CallableInterface;
      return { pass: (await password.GetPassword("imap-password")) as string };
    }

    throw new Error(`${account.name} does not expose supported mail credentials`);
  } finally {
    bus.disconnect();
  }
}
