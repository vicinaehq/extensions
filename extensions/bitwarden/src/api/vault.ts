import type { RbwCli } from "./rbw";
import type { Folder, Item, ItemType, Status, LockStatus } from "../types/bitwarden";
import { adaptListEntry, adaptGetEntry, deriveFolders, type RbwListEntry, type RbwGetEntry } from "./rbw-adapter";
import { resolveEditorShim } from "../utils/prefs";

export interface UnlockOptions {
  /** When set, password is exposed via env var of this name to the spawned rbw process. Default RBW_PINENTRY_VALUE. */
  passwordEnv?: string;
}

export type GenerateOpts =
  | { mode: "chars"; length: number; symbols: boolean; onlyNumbers?: boolean; nonconfusables?: boolean }
  | { mode: "diceware"; words: number; separator?: string; capitalize?: boolean; includeNumber?: boolean };

interface RbwConfig {
  email: string | null;
  base_url?: string | null;
}

export class Vault {
  constructor(private cli: RbwCli) {}

  /** Sentinel parity with bw's BW_SESSION token. The agent is the source of truth. */
  withSession(_session: string): Vault { return this; }

  async status(): Promise<Status | undefined> {
    const cfg = await this.cli.readJson<RbwConfig>(["config", "show"]);
    if (!cfg) return undefined;
    const unlocked = (await this.cli.tryReadText(["unlocked"])).exitCode === 0;
    const status: LockStatus = !cfg.email
      ? "unauthenticated"
      : unlocked ? "unlocked" : "locked";
    return {
      status,
      serverUrl: cfg.base_url ?? null,
      userEmail: cfg.email ?? null,
      userId: null,
      lastSync: null,
    };
  }

  async sync(): Promise<void> { await this.cli.text(["sync"]); }

  async configServer(url: string): Promise<void> { await this.cli.text(["config", "set", "base_url", url]); }
  async configEmail(email: string): Promise<void> { await this.cli.text(["config", "set", "email", email]); }

  /**
   * rbw register reads client_id and client_secret interactively.
   * We feed them via stdin (one per line). Caller must pre-set the email via configEmail.
   */
  async register(clientId: string, clientSecret: string): Promise<void> {
    await this.cli.text(["register"], { stdin: `${clientId}\n${clientSecret}\n` });
  }

  /**
   * rbw login reads master password via the configured pinentry. Caller must:
   *   1. set rbw config pinentry to the shim
   *   2. provide RBW_PINENTRY_VALUE on the cli env
   */
  async login(): Promise<void> { await this.cli.text(["login"]); }

  /**
   * Unlock through the pinentry shim. Returns the sentinel "rbw-agent".
   * Caller is expected to have routed pinentry to the shim and set RBW_PINENTRY_VALUE
   * on the underlying RbwCli (via withEnv).
   */
  async unlock(_masterPassword: string, _opts: UnlockOptions = {}): Promise<string> {
    await this.cli.text(["unlock"]);
    return "rbw-agent";
  }

  async lock(): Promise<void> { await this.cli.text(["lock"]); }

  async logout(): Promise<void> {
    try { await this.cli.text(["stop-agent"]); } catch { /* best effort */ }
    await this.cli.text(["purge"]);
  }

  async listItems(): Promise<Item[] | undefined> {
    const raw = await this.cli.readJson<RbwListEntry[]>(["list", "--raw"]);
    return raw?.map(adaptListEntry);
  }

  async listFolders(): Promise<Folder[] | undefined> {
    const raw = await this.cli.readJson<RbwListEntry[]>(["list", "--raw"]);
    return raw ? deriveFolders(raw) : undefined;
  }

  async getItem(id: string, knownType?: ItemType): Promise<Item | undefined> {
    const raw = await this.cli.readJson<RbwGetEntry>(["get", "--raw", id]);
    return raw ? adaptGetEntry(raw, knownType) : undefined;
  }

  async getTotp(id: string): Promise<string> {
    return (await this.cli.readText(["code", id])).trim();
  }

  /**
   * Create a new login. Routes rbw add through the embedded editor shim:
   * EDITOR points at the shim; RBW_EDITOR_PAYLOAD carries the buffer rbw
   * receives — first line is the password, the rest is notes (rbw's
   * convention). TOTP is stored as a `totp:` line in notes per rbw docs.
   */
  async createItem(item: { name: string; username?: string; password?: string; uri?: string; folderId?: string | null; notes?: string; totp?: string }): Promise<{ name: string }> {
    const args = ["add"];
    if (item.uri) args.push("--uri", item.uri);
    if (item.folderId) args.push("--folder", item.folderId);
    args.push(item.name);
    if (item.username) args.push(item.username);
    const noteLines: string[] = [];
    if (item.totp) noteLines.push(`totp: ${item.totp}`);
    if (item.notes) noteLines.push(item.notes);
    const payload = noteLines.length > 0
      ? `${item.password ?? ""}\n\n${noteLines.join("\n")}`
      : `${item.password ?? ""}\n`;
    const env: NodeJS.ProcessEnv = { EDITOR: resolveEditorShim(), RBW_EDITOR_PAYLOAD: payload };
    await this.cli.withEnv(env).text(args);
    return { name: item.name };
  }

  async deleteItem(id: string): Promise<void> { await this.cli.text(["remove", id]); }

  async generatePassword(opts: GenerateOpts): Promise<string> {
    const args: string[] = ["generate"];
    if (opts.mode === "diceware") {
      args.push(String(opts.words), "--diceware");
      const raw = (await this.cli.text(args)).trim();
      // rbw delimits diceware words with whitespace; tolerate dashes too in
      // case the format ever changes.
      let words = raw.split(/[\s-]+/).filter((w) => w.length > 0);
      if (opts.capitalize) words = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1));
      if (opts.includeNumber && words.length > 0) {
        // Append a single random digit to a randomly-chosen word so the
        // passphrase satisfies sites that demand a number, mirroring bw's
        // behaviour.
        const idx = Math.floor(Math.random() * words.length);
        const digit = String(Math.floor(Math.random() * 10));
        words[idx] = words[idx] + digit;
      }
      return words.join(opts.separator ?? "-");
    }
    args.push(String(opts.length));
    if (!opts.symbols) args.push("--no-symbols");
    if (opts.onlyNumbers) args.push("--only-numbers");
    if (opts.nonconfusables) args.push("--nonconfusables");
    return (await this.cli.text(args)).trim();
  }
}
