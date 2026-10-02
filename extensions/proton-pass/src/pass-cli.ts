import { getPreferenceValues } from "@vicinae/api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface Preferences {
  cliPath?: string;
}

export type Vault = {
  shareId: string;
  name: string;
};

export type PassItem = {
  shareId: string;
  itemId: string;
  title: string;
  vaultName: string;
  username?: string;
  email?: string;
  urls?: string[];
  hasTotp: boolean;
};

export type PassItemDetail = PassItem & {
  password?: string;
  note?: string;
};

function cliPath(): string {
  const configured = getPreferenceValues<Preferences>().cliPath?.trim();
  return configured || "pass-cli";
}

function reason(action: string): Record<string, string> {
  return {
    ...process.env,
    PROTON_PASS_AGENT_REASON: `Vicinae Proton Pass extension: ${action}`,
  };
}

async function run(args: string[], action: string, timeout = 15_000): Promise<string> {
  try {
    const result = await execFileAsync(cliPath(), args, {
      env: reason(action),
      encoding: "utf8",
      timeout,
      maxBuffer: 4 * 1024 * 1024,
    });
    return result.stdout.trim();
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    const detail = typeof err.stderr === "string" && err.stderr.trim() ? err.stderr.trim() : err.message;
    if (err.code === "ENOENT") {
      throw new Error(`pass-cli was not found at '${cliPath()}'. Set the pass-cli path in Vicinae preferences.`);
    }
    throw new Error(detail || "pass-cli failed");
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function loginData(raw: Record<string, unknown>): Record<string, unknown> | undefined {
  const candidates: unknown[] = [
    raw,
    raw.content,
    record(raw.content) ? raw.content.content : undefined,
  ];
  for (const candidate of candidates) {
    if (record(candidate) && record(candidate.Login)) return candidate.Login;
  }
  return undefined;
}

function parseJson(output: string, action: string): unknown {
  try {
    return JSON.parse(output) as unknown;
  } catch {
    throw new Error(`pass-cli returned invalid JSON for ${action}.`);
  }
}

function arrayFrom(data: unknown, key: string): unknown[] {
  if (Array.isArray(data)) return data;
  if (record(data) && Array.isArray(data[key])) return data[key] as unknown[];
  throw new Error(`Unexpected ${key} output from pass-cli.`);
}

export async function listVaults(): Promise<Vault[]> {
  const data = parseJson(await run(["vault", "list", "--output", "json"], "list vaults"), "vault list");
  return arrayFrom(data, "vaults").flatMap((raw) => {
    if (!record(raw)) return [];
    const shareId = text(raw.share_id ?? raw.shareId ?? raw.id);
    const name = text(raw.name);
    return shareId && name ? [{ shareId, name }] : [];
  });
}

function itemFrom(raw: unknown, vault: Vault): PassItem | undefined {
  if (!record(raw)) return undefined;
  const outer = record(raw.content) ? raw.content : raw;
  const login = loginData(raw);
  const itemId = text(raw.id ?? raw.item_id ?? raw.itemId);
  const title = text(outer.title ?? raw.title ?? raw.name);
  if (!itemId || !title) return undefined;
  const urls = login && Array.isArray(login.urls)
    ? login.urls.map((entry) => (record(entry) ? text(entry.url ?? entry.href) : text(entry))).filter((v): v is string => Boolean(v))
    : undefined;
  const totp = text(login?.totp_uri ?? login?.totpUri ?? outer.totp_uri ?? outer.totpUri ?? raw.totp_uri ?? raw.totpUri);
  return {
    shareId: vault.shareId,
    itemId,
    title,
    vaultName: vault.name,
    username: login ? text(login.username) : text(raw.username),
    email: login ? text(login.email) : text(raw.email),
    urls,
    hasTotp: Boolean(totp),
  };
}

export async function listItems(vault: Vault): Promise<PassItem[]> {
  const data = parseJson(
    await run(["item", "list", `--share-id=${vault.shareId}`, "--output", "json"], `list items in ${vault.name}`),
    "item list",
  );
  return arrayFrom(data, "items")
    .filter((raw) => !(record(raw) && text(raw.state)?.toLowerCase() === "trashed"))
    .map((raw) => itemFrom(raw, vault))
    .filter((item): item is PassItem => Boolean(item));
}

function unwrap(data: unknown): unknown {
  if (!record(data)) return data;
  for (const key of ["item", "data", "result", "response", "payload"]) {
    if (record(data[key])) return data[key];
  }
  return data;
}

export async function viewItem(item: PassItem): Promise<PassItemDetail> {
  const data = parseJson(
    await run(
      ["item", "view", `--share-id=${item.shareId}`, `--item-id=${item.itemId}`, "--output", "json"],
      `read item ${item.title}`,
    ),
    "item view",
  );
  const raw = unwrap(data);
  if (!record(raw)) return item;
  const outer = record(raw.content) ? raw.content : raw;
  const login = loginData(raw);
  return {
    ...item,
    username: login ? text(login.username) ?? item.username : item.username,
    email: login ? text(login.email) ?? item.email : item.email,
    password: login ? text(login.password) : text(raw.password),
    note: text(outer.note ?? raw.note),
  };
}

export async function getTotp(item: PassItem): Promise<string> {
  const data = parseJson(
    await run(
      ["item", "totp", `--share-id=${item.shareId}`, `--item-id=${item.itemId}`, "--output", "json"],
      `read TOTP for ${item.title}`,
    ),
    "item TOTP",
  );
  if (record(data)) {
    const values = record(data.totps) ? data.totps : data;
    for (const value of Object.values(values)) {
      const code = text(value);
      if (code) return code;
    }
  }
  throw new Error(`No TOTP code is available for ${item.title}.`);
}

export type PasswordOptions = {
  type: "random" | "passphrase";
  length?: number;
  words?: number;
  includeNumbers?: boolean;
  includeUppercase?: boolean;
  includeSymbols?: boolean;
  separator?: string;
  capitalize?: boolean;
};

export async function generatePassword(options: PasswordOptions): Promise<string> {
  const args = options.type === "random"
    ? [
        "password", "generate", "random",
        ...(options.length === undefined ? [] : ["--length", String(options.length)]),
        "--numbers", String(options.includeNumbers ?? true),
        "--uppercase", String(options.includeUppercase ?? true),
        "--symbols", String(options.includeSymbols ?? true),
      ]
    : [
        "password", "generate", "passphrase",
        ...(options.words === undefined ? [] : ["--count", String(options.words)]),
        "--separator", options.separator ?? "hyphens",
        "--capitalise", String(options.capitalize ?? true),
        "--numbers", String(options.includeNumbers ?? true),
      ];
  return run(args, "generate a password");
}
