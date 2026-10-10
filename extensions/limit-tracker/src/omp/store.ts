/**
 * oh-my-pi (`omp`) harness credential source.
 *
 * `omp` is a coding-agent harness where the user logs in once per provider
 * (`omp auth-broker login <provider>`). Logins live in a local SQLite store at
 * `~/.omp/agent/agent.db`, table `auth_credentials(provider, credential_type, data)`.
 *
 * This module exposes those credentials as a *fallback* source for the fetchers:
 * explicit preferences, environment variables and native app logins always win.
 * Rules:
 * - Best-effort only: any failure (no omp install, no node:sqlite in the host,
 *   locked DB, schema drift) resolves to null — never throws, never blocks.
 * - Never persist omp tokens anywhere (no writes to the omp DB, no writes to
 *   native credential files). Refresh results stay in memory.
 * - Never log credential material; only provider ids appear in diagnostics.
 * - Reads go through a temp-file snapshot (db + wal + shm) so the live DB is
 *   never locked and reads are consistent.
 * - Results are TTL-cached in memory (60s) to keep refresh cycles light.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { DatabaseSync } from "node:sqlite";

export interface OmpOAuthCredential {
  provider: string;
  access: string;
  refresh?: string;
  /** Epoch milliseconds, when present. */
  expires?: number;
  accountId?: string;
  email?: string;
}

export interface OmpApiKeyCredential {
  provider: string;
  key: string;
}

export interface OmpStore {
  oauth: OmpOAuthCredential[];
  apiKeys: OmpApiKeyCredential[];
}

const OMP_STORE_TTL_MS = 60_000;
const OMP_DB_FILES = ["agent.db", "agent.db-wal", "agent.db-shm"] as const;

let cachedDir: string | null = null;
let cachedStore: OmpStore | null = null;
let cachedAt = 0;

let cachedSnapshotsDir: string | null = null;
let cachedSnapshots: OmpUsageSnapshot[] | null = null;
let cachedSnapshotsAt = 0;

/** Test hook: drop the in-memory cache. */
export function clearOmpStoreCache(): void {
  cachedDir = null;
  cachedStore = null;
  cachedAt = 0;
  cachedSnapshotsDir = null;
  cachedSnapshots = null;
  cachedSnapshotsAt = 0;
}

export function findOmpAgentDir(homeDir: string = os.homedir()): string | null {
  try {
    const dir = path.join(homeDir, ".omp", "agent");
    return fs.statSync(dir).isDirectory() ? dir : null;
  } catch {
    return null;
  }
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asEpochMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  return undefined;
}

/**
 * Parse one `auth_credentials` row. Pure function (tested).
 * Returns an OAuth credential, an API-key credential, or null when the row
 * carries nothing usable. Never throws.
 */
export function parseOmpAuthRow(
  provider: unknown,
  credentialType: unknown,
  data: unknown,
): { oauth?: OmpOAuthCredential; apiKey?: OmpApiKeyCredential } {
  if (typeof provider !== "string" || !provider.trim()) return {};
  const id = provider.trim();
  if (typeof data !== "string" || !data.trim()) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(data) as unknown;
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const record = parsed as Record<string, unknown>;

  if (credentialType === "api_key") {
    const key = asTrimmedString(record.key);
    if (!key) return {};
    return { apiKey: { provider: id, key } };
  }

  const access = asTrimmedString(record.access);
  if (!access) return {};
  const credential: OmpOAuthCredential = { provider: id, access };
  const refresh = asTrimmedString(record.refresh);
  if (refresh) credential.refresh = refresh;
  const expires = asEpochMs(record.expires);
  if (expires !== undefined) credential.expires = expires;
  const accountId = asTrimmedString(record.accountId ?? record.account_id);
  if (accountId) credential.accountId = accountId;
  const email = asTrimmedString(record.email);
  if (email) credential.email = email;
  return { oauth: credential };
}

/**
 * An OAuth access token is usable only while it is not (almost) expired.
 * omp credentials cannot be refreshed from here (the OAuth client belongs to
 * omp), so expired tokens are skipped instead of attempted.
 */
export function isOmpTokenFresh(
  credential: Pick<OmpOAuthCredential, "expires">,
  nowMs: number = Date.now(),
  marginMs: number = 5 * 60 * 1000,
): boolean {
  if (credential.expires === undefined) return true;
  return credential.expires - nowMs > marginMs;
}

interface OmpSnapshot {
  db: DatabaseSync;
  dispose: () => void;
}

async function openOmpSnapshot(agentDir: string): Promise<OmpSnapshot | null> {
  let snapshotDir: string | null = null;
  try {
    const { default: nodeSqlite } = (await import("node:sqlite")) as unknown as {
      default: { DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => DatabaseSync };
    };
    snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-store-"));
    let copied = false;
    for (const file of OMP_DB_FILES) {
      const source = path.join(agentDir, file);
      try {
        if (!fs.statSync(source).isFile()) continue;
      } catch {
        continue;
      }
      fs.copyFileSync(source, path.join(snapshotDir, file));
      copied = true;
    }
    if (!copied) return null;
    const dir = snapshotDir;
    const db = new nodeSqlite.DatabaseSync(path.join(dir, "agent.db"), { readOnly: true });
    return {
      db,
      dispose: () => {
        try {
          db.close();
        } catch {
          // Ignore close failures.
        }
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup failures.
        }
      },
    };
  } catch {
    if (snapshotDir) {
      try {
        fs.rmSync(snapshotDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failures.
      }
    }
    return null;
  }
}

/**
 * Read the omp credential store. Returns null when disabled, when omp is
 * absent, the host cannot open SQLite, or anything goes wrong.
 * Results are TTL-cached.
 */
export async function readOmpStore(agentDir?: string, enabled = true): Promise<OmpStore | null> {
  if (!enabled) return null;
  const dir = agentDir ?? findOmpAgentDir();
  if (!dir) return null;

  const now = Date.now();
  if (cachedDir === dir && now - cachedAt < OMP_STORE_TTL_MS) return cachedStore;

  const store: OmpStore = { oauth: [], apiKeys: [] };
  const snapshot = await openOmpSnapshot(dir);
  if (!snapshot) {
    cachedDir = dir;
    cachedStore = null;
    cachedAt = now;
    return null;
  }
  try {
    const rows = snapshot.db
      .prepare("SELECT provider, credential_type, data FROM auth_credentials")
      .all() as Array<{ provider: unknown; credential_type: unknown; data: unknown }>;
    for (const row of rows) {
      const { oauth, apiKey } = parseOmpAuthRow(row.provider, row.credential_type, row.data);
      if (oauth) store.oauth.push(oauth);
      if (apiKey) store.apiKeys.push(apiKey);
    }
  } catch {
    cachedDir = dir;
    cachedStore = null;
    cachedAt = now;
    return null;
  } finally {
    snapshot.dispose();
  }

  cachedDir = dir;
  cachedStore = store;
  cachedAt = now;
  return store;
}

/** API-key credential for an omp provider id (e.g. "opencode-go"). Pure lookup. */
export async function getOmpApiKey(providerId: string, agentDir?: string, enabled = true): Promise<string | null> {
  const store = await readOmpStore(agentDir, enabled);
  return store?.apiKeys.find((entry) => entry.provider === providerId)?.key ?? null;
}

/** OAuth credential for an omp provider id (e.g. "anthropic", "openai-codex"). */
export async function getOmpOAuth(
  providerId: string,
  agentDir?: string,
  enabled = true,
): Promise<OmpOAuthCredential | null> {
  const store = await readOmpStore(agentDir, enabled);
  return store?.oauth.find((entry) => entry.provider === providerId) ?? null;
}

export interface OmpUsageSnapshot {
  provider: string;
  limitId: string;
  label: string;
  windowLabel: string;
  /** Fraction used, 0..1. */
  usedFraction: number;
  /** omp status: "ok" | "warning" | "exhausted" | ... */
  status: string;
  /** Epoch milliseconds, when omp records one. */
  resetsAtMs: number | null;
}

interface OmpUsageSnapshotRow {
  provider: unknown;
  limit_id: unknown;
  label: unknown;
  window_label: unknown;
  used_fraction: unknown;
  status: unknown;
  resets_at: unknown;
}

/**
 * Parse one `usage_history` row. Pure function (tested).
 *
 * Honesty contract: omp records NO timestamps on these rows, so a snapshot
 * carries no "as of" time. Consumers must label values as harness snapshots
 * (e.g. "via omp"), must never render reset countdowns from null resets, and
 * must prefer direct provider APIs whenever available.
 */
export function parseOmpUsageSnapshotRow(row: OmpUsageSnapshotRow): OmpUsageSnapshot | null {
  if (typeof row.provider !== "string" || !row.provider.trim()) return null;
  if (typeof row.limit_id !== "string" || !row.limit_id.trim()) return null;
  if (typeof row.used_fraction !== "number" || !Number.isFinite(row.used_fraction)) return null;
  const usedFraction = Math.min(1, Math.max(0, row.used_fraction));
  const resetsAt =
    typeof row.resets_at === "number" && Number.isFinite(row.resets_at) && row.resets_at > 0
      ? row.resets_at * 1000
      : null;
  return {
    provider: row.provider.trim(),
    limitId: row.limit_id.trim(),
    label: typeof row.label === "string" && row.label.trim() ? row.label.trim() : row.limit_id.trim(),
    windowLabel:
      typeof row.window_label === "string" && row.window_label.trim() ? row.window_label.trim() : "",
    usedFraction,
    status: typeof row.status === "string" && row.status.trim() ? row.status.trim() : "unknown",
    resetsAtMs: resetsAt,
  };
}

/**
 * Quota snapshots recorded by the harness (`usage_history` table), optionally
 * filtered by omp provider id (e.g. "google-antigravity"). Null when omp is
 * absent or unreadable. TTL-cached like credentials.
 */
export async function readOmpUsageSnapshots(
  providerId?: string,
  agentDir?: string,
  enabled = true,
): Promise<OmpUsageSnapshot[] | null> {
  if (!enabled) return null;
  const dir = agentDir ?? findOmpAgentDir();
  if (!dir) return null;

  const now = Date.now();
  if (cachedSnapshotsDir === dir && now - cachedSnapshotsAt < OMP_STORE_TTL_MS) {
    return filterSnapshots(cachedSnapshots, providerId);
  }

  const snapshots: OmpUsageSnapshot[] = [];
  const snapshot = await openOmpSnapshot(dir);
  if (!snapshot) {
    cachedSnapshotsDir = dir;
    cachedSnapshots = null;
    cachedSnapshotsAt = now;
    return null;
  }
  try {
    const rows = snapshot.db
      .prepare("SELECT provider, limit_id, label, window_label, used_fraction, status, resets_at FROM usage_history")
      .all() as unknown as OmpUsageSnapshotRow[];
    for (const row of rows) {
      const parsed = parseOmpUsageSnapshotRow(row);
      if (parsed) snapshots.push(parsed);
    }
  } catch {
    cachedSnapshotsDir = dir;
    cachedSnapshots = null;
    cachedSnapshotsAt = now;
    return null;
  } finally {
    snapshot.dispose();
  }

  cachedSnapshotsDir = dir;
  cachedSnapshots = snapshots;
  cachedSnapshotsAt = now;
  return filterSnapshots(snapshots, providerId);
}

function filterSnapshots(
  snapshots: OmpUsageSnapshot[] | null,
  providerId?: string,
): OmpUsageSnapshot[] | null {
  if (!snapshots) return null;
  if (!providerId) return snapshots;
  return snapshots.filter((entry) => entry.provider === providerId);
}
