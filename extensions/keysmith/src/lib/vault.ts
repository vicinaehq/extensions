import { LocalStorage, showToast, Toast } from "@vicinae/api";
import { randomBytes } from "crypto";
import * as fs from "fs";
import { useCallback, useEffect, useState } from "react";
import {
  deriveKey,
  describeConfigReadError,
  ensureSodium,
  masterSaltB64,
  readConfig,
  verifyKey,
} from "./keysmith";
import { isSupportedPlatform } from "./platform";

/**
 * How long an unlocked vault key is kept around.
 *
 * - `every-time`: nothing is written; the key lives in memory for the view only.
 * - `on-logout`: the key survives until the Vicinae daemon restarts, which
 *   tracks the login session on a per-session service.
 * - `on-reboot`: the key survives until the machine reboots.
 * - `never`: the key is written and left in place until the user locks by hand
 *   or the Keysmith password changes. The riskiest of the four, because the
 *   cached key is only ever as private as vicinae.db.
 */
export type LockPolicy = "every-time" | "on-logout" | "on-reboot" | "never";

/** The policy the forms start on, and the one the UI suggests. */
export const DEFAULT_LOCK_POLICY: LockPolicy = "on-logout";

export const LOCK_POLICIES: {
  value: LockPolicy;
  title: string;
  description: string;
  /** Set on the policy the UI nudges users toward. */
  recommended?: boolean;
}[] = [
  {
    value: "every-time",
    title: "Every time",
    description: "Ask for your password on every launch. Nothing is written to disk.",
  },
  {
    value: "on-logout",
    title: "On logout",
    description: "Remember the unlocked key until the Vicinae session ends.",
    recommended: true,
  },
  {
    value: "on-reboot",
    title: "On reboot",
    description: "Remember the unlocked key until you reboot.",
  },
  {
    value: "never",
    title: "Never",
    description:
      "Never forget the key. It stays in Vicinae's local storage until you lock by hand, so anything able to read vicinae.db can generate your codes.",
  },
];

/**
 * Result of trying to unlock the vault with a password.
 *
 * - `ok`: the password opened at least one account. The key is trusted.
 * - `nothing-to-verify`: the vault has a master-key section but no accounts to
 *   test against. The key is accepted but could not be confirmed, so it must
 *   never be used to write a new account.
 * - `invalid-password`: an account failed to open. The password is wrong.
 *
 * I/O and parse failures are not represented here. They keep throwing, because
 * they are not authentication failures.
 */
export type UnlockOutcome =
  | { status: "ok"; key: Uint8Array; saltB64: string }
  | { status: "nothing-to-verify"; key: Uint8Array; saltB64: string }
  | { status: "invalid-password" };

/**
 * Derives the vault key from a password and verifies it against the first
 * account section it finds.
 */
export async function unlockVault(configPath: string, password: string): Promise<UnlockOutcome> {
  await ensureSodium();
  const config = readConfig(configPath);
  const master = config["master-key"];
  if (!master) {
    throw new Error("Keysmith.conf is missing the master-key section");
  }

  const { key, saltB64 } = await deriveKey(password, master);
  const verification = verifyKey(config, key);
  if (verification === "invalid") {
    return { status: "invalid-password" };
  }
  if (verification === "nothing-to-verify") {
    return { status: "nothing-to-verify", key, saltB64 };
  }
  return { status: "ok", key, saltB64 };
}

const CACHE_KEY = "keysmith.unlock";
const POLICY_KEY = "keysmith.lockPolicy";
const CACHE_VERSION = 1;

type UnlockCache = {
  v: number;
  key: string;
  salt: string;
  bootId: string;
  daemonStart: string;
};

/**
 * A nonce that lives as long as the extension worker process. It is the fallback
 * session token for the "on logout" policy when the Vicinae daemon start time
 * cannot be read from /proc.
 */
const sessionNonce = randomBytes(16).toString("base64");

/** Contents of /proc/sys/kernel/random/boot_id, or null when unavailable. */
export function bootId(): string | null {
  try {
    return fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
  } catch {
    return null;
  }
}

function readProc(pid: number, file: string): string | null {
  try {
    return fs.readFileSync(`/proc/${pid}/${file}`, "utf8");
  } catch {
    return null;
  }
}

/**
 * Reads a numeric field from /proc/<pid>/stat. The comm field (2) can contain
 * spaces and parentheses, so parsing resumes after the last ")".
 */
function statField(pid: number, field: number): string | null {
  const stat = readProc(pid, "stat");
  if (!stat) return null;
  const close = stat.lastIndexOf(")");
  if (close === -1) return null;
  const rest = stat
    .slice(close + 2)
    .trim()
    .split(/\s+/);
  // rest[0] is field 3 (state); field N lives at index N - 3.
  return rest[field - 3] ?? null;
}

function findVicinaePid(): number | null {
  let pid: number | null = process.pid;
  for (let depth = 0; depth < 8 && pid != null && pid > 1; depth++) {
    const comm = readProc(pid, "comm")?.trim();
    if (comm === "vicinae-server" || comm === "vicinae") return pid;
    const ppid = statField(pid, 4);
    pid = ppid != null ? Number.parseInt(ppid, 10) : null;
  }
  return null;
}

/**
 * The Vicinae daemon's start time (field 22 of /proc/<pid>/stat), or null when
 * the daemon cannot be found. A new start time means a new login session.
 */
export function daemonStart(): string | null {
  const pid = findVicinaePid();
  return pid != null ? statField(pid, 22) : null;
}

function sessionToken(): string {
  return daemonStart() ?? sessionNonce;
}

async function readCache(): Promise<UnlockCache | null> {
  try {
    const raw = await LocalStorage.getItem<string>(CACHE_KEY);
    if (typeof raw !== "string") return null;
    const parsed = JSON.parse(raw) as Partial<UnlockCache>;
    if (parsed.v !== CACHE_VERSION) return null;
    if (typeof parsed.key !== "string" || typeof parsed.salt !== "string") return null;
    if (typeof parsed.bootId !== "string" || typeof parsed.daemonStart !== "string") return null;
    return parsed as UnlockCache;
  } catch {
    return null;
  }
}

/** Removes the cached key. Used by "Lock now" and by staleness checks. */
export async function clearCache(): Promise<void> {
  await LocalStorage.removeItem(CACHE_KEY);
}

export async function readLockPolicy(): Promise<LockPolicy | null> {
  const value = await LocalStorage.getItem<string>(POLICY_KEY);
  // Reading through the list keeps this in step with the policies we offer.
  return LOCK_POLICIES.some((entry) => entry.value === value) ? (value as LockPolicy) : null;
}

export async function writeLockPolicy(policy: LockPolicy): Promise<void> {
  await LocalStorage.setItem(POLICY_KEY, policy);
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, "base64").values());
}

/**
 * Caches the unlocked key according to the policy, or clears the cache when the
 * policy does not call for one. Only called after a successful unlock.
 */
export async function rememberUnlockedKey(
  outcome: Exclude<UnlockOutcome, { status: "invalid-password" }>,
  policy: LockPolicy,
): Promise<void> {
  if (policy === "every-time" || outcome.status === "nothing-to-verify") {
    // An unverified key is never cached. On a later launch it would be
    // indistinguishable from a key confirmed against a real account, and it
    // must not be reused to write.
    await clearCache();
    return;
  }
  const currentBootId = bootId();
  if (currentBootId == null && policy !== "never") {
    // Without a boot id, neither "on logout" nor "on reboot" can be scoped
    // reliably. "never" has no scope to check, so it does not need one.
    await clearCache();
    return;
  }
  const entry: UnlockCache = {
    v: CACHE_VERSION,
    key: bytesToBase64(outcome.key),
    salt: outcome.saltB64,
    bootId: currentBootId ?? "",
    daemonStart: sessionToken(),
  };
  await LocalStorage.setItem(CACHE_KEY, JSON.stringify(entry));
}

/**
 * Returns the cached key when the policy and the staleness checks allow it,
 * otherwise drops the cache and returns null. Throws on config I/O failures,
 * which the caller surfaces like any other read error.
 */
export async function loadCachedKey(
  configPath: string,
  policy: LockPolicy,
): Promise<{ key: Uint8Array; saltB64: string } | null> {
  if (policy === "every-time") {
    await clearCache();
    return null;
  }

  const entry = await readCache();
  if (!entry) return null;

  const currentSalt = masterSaltB64(readConfig(configPath));
  if (!currentSalt || currentSalt !== entry.salt) {
    // The Keysmith password changed, so the cached key is stale by definition.
    await clearCache();
    return null;
  }

  // "never" answers no to both checks below on purpose: the key is kept until
  // the salt changes or the user locks by hand.
  if (policy === "on-reboot") {
    if (entry.bootId !== bootId()) {
      await clearCache();
      return null;
    }
  }

  if (policy === "on-logout") {
    if (entry.daemonStart !== sessionToken()) {
      await clearCache();
      return null;
    }
  }

  return { key: base64ToBytes(entry.key), saltB64: entry.salt };
}

export type VaultSession = {
  key: Uint8Array;
  saltB64: string;
  /** False when the vault had no accounts to verify the password against. */
  verified: boolean;
  policy: LockPolicy;
};

export type UnlockResult = { ok: true } | { ok: false; message: string };

export type VaultGate = {
  status: "loading" | "locked" | "unlocked" | "error" | "unsupported";
  /** True when no lock policy is stored yet, which is the first-run case. */
  firstRun: boolean;
  error: string | null;
  session: VaultSession | null;
  unlock: (password: string, policy: LockPolicy) => Promise<UnlockResult>;
  /** Clears the cache and returns to the locked state. */
  lock: () => Promise<void>;
  /** Changes the stored policy and re-caches the current key accordingly. */
  setPolicy: (policy: LockPolicy) => Promise<void>;
};

/**
 * Drives the locked/unlocked gate shared by both commands. The derived key is
 * held in React state and never in the password field.
 */
export function useVault(configPath: string): VaultGate {
  const [status, setStatus] = useState<VaultGate["status"]>("loading");
  const [firstRun, setFirstRun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<VaultSession | null>(null);

  const bootstrap = useCallback(async () => {
    if (!isSupportedPlatform()) {
      // Nothing here can work, so do not touch the filesystem to find out.
      setStatus("unsupported");
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const policy = await readLockPolicy();
      if (!policy) {
        setFirstRun(true);
        setStatus("locked");
        return;
      }
      setFirstRun(false);
      const cached = await loadCachedKey(configPath, policy);
      if (!cached) {
        setStatus("locked");
        return;
      }
      setSession({ key: cached.key, saltB64: cached.saltB64, verified: true, policy });
      setStatus("unlocked");
    } catch (err) {
      setError(describeConfigReadError(err, configPath));
      setStatus("error");
    }
  }, [configPath]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const unlock = useCallback(
    async (password: string, policy: LockPolicy): Promise<UnlockResult> => {
      const outcome = await unlockVault(configPath, password);
      if (outcome.status === "invalid-password") {
        return {
          ok: false,
          message: "That password did not unlock your Keysmith vault. Try again.",
        };
      }
      const verified = outcome.status === "ok";
      await writeLockPolicy(policy);
      await rememberUnlockedKey(outcome, policy);
      setSession({ key: outcome.key, saltB64: outcome.saltB64, verified, policy });
      setFirstRun(false);
      setStatus("unlocked");
      if (!verified) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Vault could not be verified",
          message:
            "Your vault has no accounts yet, so the password could not be confirmed. Nothing will be written until it can be.",
        }).catch(() => {
          // Toast display is best-effort.
        });
      }
      return { ok: true };
    },
    [configPath],
  );

  const lock = useCallback(async () => {
    await clearCache();
    setSession(null);
    setStatus("locked");
  }, []);

  const setPolicy = useCallback(
    async (policy: LockPolicy) => {
      await writeLockPolicy(policy);
      if (session) {
        await rememberUnlockedKey(
          {
            status: session.verified ? "ok" : "nothing-to-verify",
            key: session.key,
            saltB64: session.saltB64,
          },
          policy,
        );
      }
      setSession((prev) => (prev ? { ...prev, policy } : prev));
    },
    [session],
  );

  return { status, firstRun, error, session, unlock, lock, setPolicy };
}
