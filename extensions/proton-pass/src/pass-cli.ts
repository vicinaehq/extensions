import { getPreferenceValues, open } from "@vicinae/api";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { extractTotpCode, passwordArgs } from "./cli-contract";
import type { PasswordOptions } from "./cli-contract";

export { extractTotpCode, passwordArgs } from "./cli-contract";
export type { PasswordOptions } from "./cli-contract";

const execFileAsync = promisify(execFile);

interface Preferences {
  cliPath?: string;
}

export type Vault = {
  shareId: string;
  name: string;
  itemCount?: number;
  role?: string;
};

export type PassItem = {
  shareId: string;
  itemId: string;
  title: string;
  vaultName: string;
  type: string;
  username?: string;
  email?: string;
  urls?: string[];
  hasTotp: boolean;
};

export type PassItemDetail = PassItem & {
  password?: string;
  note?: string;
  customFields?: Array<{ name: string; value: string; type: "text" | "hidden" }>;
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

function typedData(raw: Record<string, unknown>): { type: string; data?: Record<string, unknown> } {
  const outer = record(raw.content) ? raw.content : raw;
  const inner = record(outer.content) ? outer.content : outer;
  const types: Array<[string, string]> = [
    ["Login", "login"],
    ["Note", "note"],
    ["CreditCard", "credit_card"],
    ["credit_card", "credit_card"],
    ["Identity", "identity"],
    ["Alias", "alias"],
    ["SshKey", "ssh_key"],
    ["ssh_key", "ssh_key"],
    ["Wifi", "wifi"],
  ];
  for (const [key, type] of types) {
    if (record(inner[key])) return { type, data: inner[key] };
  }
  return { type: "note" };
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
    const itemCountRaw = raw.item_count ?? raw.itemCount ?? raw.items_count ?? raw.itemsCount;
    const itemCount = itemCountRaw === undefined ? undefined : Number(itemCountRaw);
    const role = text(raw.role)?.toLowerCase();
    return shareId && name
      ? [{
          shareId,
          name,
          itemCount: itemCount !== undefined && Number.isFinite(itemCount) ? itemCount : undefined,
          role,
        }]
      : [];
  });
}

function itemFrom(raw: unknown, vault: Vault): PassItem | undefined {
  if (!record(raw)) return undefined;
  const outer = record(raw.content) ? raw.content : raw;
  const login = loginData(raw);
  const type = typedData(raw).type;
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
    type,
    username: login ? text(login.username) : text(raw.username),
    email: login ? text(login.email) : text(raw.email),
    urls,
    hasTotp: Boolean(totp),
  };
}

export async function listItems(vault: Vault): Promise<PassItem[]> {
  const data = parseJson(
    await run(
      ["item", "list", `--share-id=${vault.shareId}`, "--output", "json", "--show-secrets"],
      `list items in ${vault.name}`,
    ),
    "item list",
  );
  return arrayFrom(data, "items")
    .filter((raw) => !(record(raw) && text(raw.state)?.toLowerCase() === "trashed"))
    .map((raw) => itemFrom(raw, vault))
    .filter((item): item is PassItem => Boolean(item));
}

export async function listVaultsAndItems(): Promise<{ vaults: Vault[]; items: PassItem[] }> {
  const vaults = await listVaults();
  const lists = new Array<PassItem[]>(vaults.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < vaults.length) {
      const index = next++;
      lists[index] = await listItems(vaults[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, vaults.length) }, () => worker()));
  return { vaults, items: lists.flat().sort((a, b) => a.title.localeCompare(b.title)) };
}

export async function listAllItems(): Promise<PassItem[]> {
  return (await listVaultsAndItems()).items;
}

export async function checkAuth(): Promise<boolean> {
  try {
    await run(["info"], "check authentication");
    return true;
  } catch (error) {
    if (error instanceof Error && /authenticated|logged in|session/i.test(error.message)) return false;
    throw error;
  }
}

export async function login(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cliPath(), ["login"], {
      env: reason("login to Proton Pass"),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let opened = false;
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("Proton Pass login timed out. Complete browser authentication and try again."));
    }, 10 * 60_000);

    function finish(error?: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(output);
    }

    function scanForLoginUrl(): void {
      if (opened) return;
      for (const candidate of output.match(/https?:\/\/\S+/g) ?? []) {
        try {
          const url = new URL(candidate.replace(/[),.;]+$/, ""));
          if (url.protocol !== "https:" || url.host !== "account.proton.me") continue;
          opened = true;
          void open(url.toString()).catch(() => {
            child.kill();
            finish(new Error("Could not open the Proton Pass login URL."));
          });
          return;
        } catch {
          // Continue scanning output until pass-cli prints a complete URL.
        }
      }
    }

    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      scanForLoginUrl();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      scanForLoginUrl();
    });
    child.on("error", (error) => finish(error instanceof Error ? error : new Error("pass-cli login failed.")));
    child.on("close", (code) => {
      if (code === 0) finish();
      else finish(new Error(output.trim() || `pass-cli login exited with code ${code ?? "unknown"}.`));
    });
  });
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
  const type = typedData(raw).type;
  const typed = typedData(raw).data;
  const customFieldsRaw = outer.extra_fields ?? outer.extraFields ?? raw.extra_fields ?? raw.extraFields;
  const customFields = Array.isArray(customFieldsRaw)
    ? customFieldsRaw.flatMap((field) => {
        if (!record(field)) return [];
        const name = text(field.name ?? field.key);
        const value = text(field.value);
        if (!name || !value) return [];
        return [{ name, value, type: text(field.type)?.toLowerCase() === "text" ? "text" as const : "hidden" as const }];
      })
    : undefined;
  return {
    ...item,
    type,
    username: login ? text(login.username) ?? item.username : item.username,
    email: login ? text(login.email) ?? item.email : item.email,
    password: login ? text(login.password) : text(typed?.password ?? raw.password),
    note: text(outer.note ?? raw.note),
    customFields: customFields?.length ? customFields : undefined,
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
  const code = extractTotpCode(data);
  if (code) return code;
  throw new Error(`No TOTP code is available for ${item.title}.`);
}

export async function generatePassword(options: PasswordOptions): Promise<string> {
  return run(passwordArgs(options), "generate a password");
}
