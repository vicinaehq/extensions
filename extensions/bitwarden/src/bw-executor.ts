import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { BwError, BwFolder, BwItem, ItemTypeValue } from './bitwarden-types';
import type { BwSend, CreateSendPayload } from './send-types';
import { getDownloadDir, getPreferences } from './preferences';

const exec = promisify(execFile);

function execStdin(
  bin: string,
  args: string[],
  stdin: string,
  opts?: { env?: NodeJS.ProcessEnv; timeout?: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      env: opts?.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: opts?.timeout,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `Process exited with code ${code}`));
    });
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

/** Token that identifies an unlocked vault session */
export type Session = string;

interface BwStatus {
  serverUrl: string | null;
  lastSync: string | null;
  userEmail: string;
  userId: string;
  status: 'unauthenticated' | 'locked' | 'unlocked';
}

function bwEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  try {
    const prefs = getPreferences();
    if (prefs.customCertPath) {
      env.NODE_EXTRA_CA_CERTS = prefs.customCertPath;
    }
  } catch {
    // Preferences not available
  }
  return env;
}

function parseJson<T>(stdout: string): T {
  try {
    return JSON.parse(stdout) as T;
  } catch {
    throw new BwError('Failed to parse `bw` output as JSON', 'PARSE_ERROR');
  }
}

function sessionEnv(session: Session): NodeJS.ProcessEnv {
  return { ...bwEnv(), BW_SESSION: session };
}

function hasStderr(err: unknown): err is { stderr: unknown } {
  return typeof err === 'object' && err !== null && 'stderr' in err;
}

async function execBw(
  args: string[],
  opts: { timeout?: number; maxBuffer?: number; env?: NodeJS.ProcessEnv },
): Promise<string> {
  const { stdout } = await exec('bw', args, opts);
  return stdout;
}

async function execBwJson<T>(
  args: string[],
  opts: { timeout?: number; maxBuffer?: number; env?: NodeJS.ProcessEnv },
): Promise<T> {
  const stdout = await execBw(args, opts);
  return parseJson<T>(stdout);
}

async function execBwTrim(
  args: string[],
  opts: { timeout?: number; env?: NodeJS.ProcessEnv },
): Promise<string> {
  const stdout = await execBw(args, opts);
  return stdout.trim();
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const stderrRaw = hasStderr(err) ? String(err.stderr ?? '').trim() : '';
    const cleaned = stderrRaw
      .split('\n')
      .filter(
        (line) =>
          !['[DEP0', 'DeprecationWarning', 'trace-deprecation'].some((s) => line.includes(s)),
      )
      .join('\n')
      .trim();
    const raw = cleaned || err.message;
    return friendlyMessage(raw);
  }
  return friendlyMessage(String(err));
}

function friendlyMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('incorrect client_secret') || lower.includes('incorrect clientid')) {
    return 'Invalid API credentials — check your Client ID and Client Secret in extension preferences.';
  }
  if (lower.includes('invalid master password')) {
    return 'Incorrect master password.';
  }
  if (lower.includes('not logged in')) {
    return 'Not logged in.';
  }
  if (
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('getaddrinfo') ||
    lower.includes('econnreset')
  ) {
    return 'Cannot reach Bitwarden server — check your connection and server URL.';
  }
  if (lower.includes('two-factor') || lower.includes('two step')) {
    return 'Two-step login is required but the CLI does not support it for API key logins.';
  }
  if (lower.includes('timed out') || lower.includes('etimedout')) {
    return 'Request timed out — the Bitwarden server did not respond in time.';
  }
  if (lower.includes('rate limit') || lower.includes('429')) {
    return 'Too many requests — wait a moment and try again.';
  }
  return raw;
}

function toBwError(err: unknown): BwError {
  if (err instanceof BwError) return err;
  return new BwError(getErrorMessage(err), 'CLI_ERROR');
}

/**
 * Encode JSON payload and pipe it to a bw command that reads from stdin.
 * Returns the trimmed stdout of the target command.
 */
async function encodeAndExec(
  payload: unknown,
  cmd: string,
  args: string[],
  session: Session,
): Promise<string> {
  const json = JSON.stringify(payload);
  const env = sessionEnv(session);
  const encoded = await execStdin('bw', ['encode'], json, { env, timeout: 15000 });
  return execStdin('bw', [cmd, ...args], encoded, { env, timeout: 15000 });
}

/**
 * Check whether the `bw` binary is installed and on PATH.
 */
export async function checkInstalled(): Promise<boolean> {
  try {
    await exec('bw', ['--version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Login to a Bitwarden Server using an API key.
 * Must be called once before any Unlock.
 * Sets the server URL for self-hosted instances before login.
 */
export async function login(params: {
  clientId: string;
  clientSecret: string;
  serverUrl: string;
}): Promise<void> {
  const env = {
    ...bwEnv(),
    BW_CLIENTID: params.clientId,
    BW_CLIENTSECRET: params.clientSecret,
  };

  try {
    await execBw(['config', 'server', params.serverUrl], {
      timeout: 10000,
      env,
    });
  } catch (err) {
    throw toBwError(err);
  }

  try {
    await execBw(['login', '--apikey'], {
      timeout: 30000,
      env,
    });
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Retrieve the current status of the `bw` CLI (unauthenticated / locked / unlocked).
 */
export async function status(): Promise<BwStatus> {
  try {
    return await execBwJson<BwStatus>(['status'], { timeout: 10000 });
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Unlock the vault using the master password.
 * Returns the Session token.
 */
export async function unlock(masterPassword: string): Promise<Session> {
  try {
    const { stdout } = await exec('bw', ['unlock', '--passwordenv', 'BW_PASSWORD', '--raw'], {
      timeout: 15000,
      env: { ...bwEnv(), BW_PASSWORD: masterPassword },
    });
    return stdout.trim();
  } catch (err) {
    const bwErr = toBwError(err);
    if (
      bwErr.message.toLowerCase().includes('invalid') ||
      bwErr.message.toLowerCase().includes('password')
    ) {
      throw new BwError('Invalid master password', 'INVALID_PASSWORD');
    }
    throw bwErr;
  }
}

/**
 * Pull the latest vault state from the Server.
 * Requires a valid Session.
 */
export async function sync(session: Session): Promise<void> {
  try {
    await execBw(['sync'], { timeout: 30000, env: sessionEnv(session) });
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * List all Items in the vault.
 * Requires a valid Session.
 */
export async function listItems(session: Session): Promise<BwItem[]> {
  try {
    return await execBwJson<BwItem[]>(['list', 'items'], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
      env: sessionEnv(session),
    });
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * List all Folders in the vault.
 * Requires a valid Session.
 */
export async function listFolders(session: Session): Promise<BwFolder[]> {
  try {
    return await execBwJson<BwFolder[]>(['list', 'folders'], {
      timeout: 15000,
      env: sessionEnv(session),
    });
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Get a single Item by ID with full details (including password).
 * Requires a valid Session.
 */
export async function getItem(id: string, session: Session): Promise<BwItem> {
  try {
    return await execBwJson<BwItem>(['get', 'item', id], {
      timeout: 15000,
      env: sessionEnv(session),
    });
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Get a TOTP code for a Login item.
 * Requires a valid Session.
 */
export async function getTotp(id: string, session: Session): Promise<string> {
  try {
    return await execBwTrim(['get', 'totp', id], {
      timeout: 10000,
      env: sessionEnv(session),
    });
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Create a new Item in the vault.
 * Requires a valid Session. The `payload` is the full JSON object
 * matching Bitwarden's internal item schema.
 */
export async function createItem(payload: CreateItemPayload, session: Session): Promise<BwItem> {
  try {
    const stdout = await encodeAndExec(payload, 'create', ['item'], session);
    return parseJson<BwItem>(stdout);
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Edit an existing Item in the vault.
 * Requires a valid Session. The `payload` is a partial item JSON
 * with only the fields to update.
 */
export async function editItem(id: string, payload: object, session: Session): Promise<void> {
  try {
    await encodeAndExec(payload, 'edit', ['item', id], session);
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Create a new Folder in the vault.
 * Requires a valid Session. Returns the created folder with its id.
 */
export async function createFolder(name: string, session: Session): Promise<BwFolder> {
  try {
    const stdout = await encodeAndExec({ name }, 'create', ['folder'], session);
    return parseJson<BwFolder>(stdout);
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Delete an Item from the vault by ID.
 * Requires a valid Session.
 */
export async function deleteItem(id: string, session: Session): Promise<void> {
  try {
    await execBw(['delete', 'item', id], {
      timeout: 15000,
      env: sessionEnv(session),
    });
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Log out of Bitwarden, clearing the stored API key login state.
 */
export async function logout(): Promise<void> {
  try {
    await exec('bw', ['logout'], { timeout: 10000 });
  } catch (err) {
    const message = getErrorMessage(err);
    if (message.toLowerCase().includes('not logged in')) return;
    throw toBwError(err);
  }
}

/**
 * Lock the vault, invalidating the current Session.
 */
export async function lock(session: Session): Promise<void> {
  try {
    await execBw(['lock'], { timeout: 10000, env: sessionEnv(session) });
  } catch {
    // Lock failures are non-fatal — the session is cleared client-side regardless
  }
}

/**
 * Generate a random password using the `bw generate` command.
 * No session required — this is a local cryptographic operation.
 */
export async function generatePassword(options: {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
}): Promise<string> {
  const flags: string[] = [];
  if (options.uppercase) flags.push('-u');
  if (options.lowercase) flags.push('-l');
  if (options.numbers) flags.push('-n');
  if (options.symbols) flags.push('-s');
  flags.push('--length', String(options.length));

  try {
    return await execBwTrim(['generate', ...flags], {
      timeout: 10000,
    });
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Download an attached file from an Item to the Downloads folder.
 * Returns the path to the downloaded file.
 */
export async function downloadAttachment(
  attachmentId: string,
  itemId: string,
  fileName: string,
  session: Session,
): Promise<string> {
  let downloadDir: string;
  try {
    downloadDir = getDownloadDir(getPreferences());
  } catch {
    downloadDir = `${process.env.HOME ?? '/tmp'}/Downloads`;
  }
  const outPath = join(downloadDir, fileName);
  try {
    await execBw(['get', 'attachment', attachmentId, '--itemid', itemId, '--output', outPath], {
      timeout: 30000,
      env: sessionEnv(session),
    });
    return outPath;
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Attach a file from the local filesystem to an existing Item.
 */
export async function createAttachment(
  itemId: string,
  filePath: string,
  session: Session,
): Promise<void> {
  try {
    await execBw(['create', 'attachment', '--itemid', itemId, '--file', filePath], {
      timeout: 30000,
      env: sessionEnv(session),
    });
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * List all Sends.
 * Requires a valid Session.
 */
export async function listSends(session: Session): Promise<BwSend[]> {
  try {
    return await execBwJson<BwSend[]>(['send', 'list'], {
      timeout: 30000,
      env: sessionEnv(session),
    });
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Get a single Send by ID with full details.
 * Requires a valid Session.
 */
export async function getSend(id: string, session: Session): Promise<BwSend> {
  try {
    return await execBwJson<BwSend>(['send', 'get', id], {
      timeout: 15000,
      env: sessionEnv(session),
    });
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Create a new Send.
 * Requires a valid Session. The payload is the full JSON object
 * matching Bitwarden's internal send schema.
 */
export async function createSend(payload: CreateSendPayload, session: Session): Promise<BwSend> {
  try {
    const stdout = await encodeAndExec(payload, 'send', ['create'], session);
    return parseJson<BwSend>(stdout);
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Edit an existing Send.
 * Requires a valid Session.
 */
export async function editSend(id: string, payload: object, session: Session): Promise<void> {
  try {
    await encodeAndExec(payload, 'send', ['edit', id], session);
  } catch (err) {
    throw toBwError(err);
  }
}

/**
 * Delete a Send by ID.
 * Requires a valid Session.
 */
export async function deleteSend(id: string, session: Session): Promise<void> {
  try {
    await execBw(['send', 'delete', id], {
      timeout: 15000,
      env: sessionEnv(session),
    });
  } catch (err) {
    throw toBwError(err);
  }
}

interface ReceiveSendResult {
  kind: 'text' | 'file';
  text?: string;
  path?: string;
}

/**
 * Receive a Send by URL.
 * No session required — `bw send receive` works without authentication.
 * Pass `output` to specify a download directory for file sends; text sends ignore it.
 * Returns `{ kind: 'file', path }` when stdout starts with "Saved",
 * otherwise `{ kind: 'text', text }`.
 */
export async function receiveSend(
  url: string,
  password?: string,
  output?: string,
): Promise<ReceiveSendResult> {
  const args = ['send', 'receive', url];
  const env: NodeJS.ProcessEnv = { ...bwEnv() };
  if (password) {
    args.push('--passwordenv', 'BW_SEND_PASSWORD');
    env.BW_SEND_PASSWORD = password;
  }
  if (output) args.push('--output', output);
  try {
    const stdout = await execBw(args, { timeout: 30000, env });
    const trimmed = stdout.trim();
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('saved ')) {
      const filePath = trimmed.slice(6).trim();
      return { kind: 'file', path: filePath };
    }
    return { kind: 'text', text: trimmed };
  } catch (err) {
    throw toBwError(err);
  }
}

/** Descriptor for an action the user can take on an Item */
export interface ItemAction {
  label: string;
  value: string;
  icon?: string;
  /** When set, the action fetches the real value from the bw CLI instead of using `value`. */
  fetchKind?: 'password' | 'totp' | 'cardNumber' | 'cardCode';
}

/** Payload passed to createItem() */
export interface CreateItemPayload {
  type: ItemTypeValue;
  name: string;
  notes: string | null;
  folderId: string | null;
  favorite: boolean;
  login?: {
    username: string | null;
    password: string | null;
    totp: string | null;
    uris?: { uri: string; match: null }[];
  };
  card?: {
    cardholderName: string | null;
    brand: string | null;
    number: string | null;
    expMonth: string | null;
    expYear: string | null;
    code: string | null;
  };
  identity?: {
    title: string | null;
    firstName: string | null;
    middleName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  };
  secureNote?: {
    type: number;
  };
  fields?: { name: string; value: string; type: number }[];
}
