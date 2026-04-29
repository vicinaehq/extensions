import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { showToast, Toast } from "@vicinae/api";
import { RbwCli } from "../api/rbw";
import { Vault } from "../api/vault";
import { getPrefs, resolveCliPath, resolvePinentryShim } from "../utils/prefs";
import {
  getLastAppliedServerUrl,
  setLastAppliedServerUrl,
  getLastSync,
  setLastSync,
} from "../api/session-store";
import { Locked, NotLoggedIn, AuthFailed, BwNotFound } from "../api/errors";

type AuthState =
  | { kind: "loading" }
  | { kind: "needs-cli" }
  | { kind: "needs-login" }
  | { kind: "needs-unlock" }
  | { kind: "unlocked"; vault: Vault; session: string };

interface SessionContextValue {
  state: AuthState;
  unlock: (masterPassword: string) => Promise<void>;
  lock: () => Promise<void>;
  logout: () => Promise<void>;
  loginApiKey: (email: string, clientId: string, clientSecret: string, masterPassword: string) => Promise<void>;
  invalidateSession: () => Promise<void>;
}

const Ctx = createContext<SessionContextValue | null>(null);

const SENTINEL_SESSION = "rbw-agent";

interface RbwConfigSnapshot { pinentry?: string | null }

async function ensurePinentryShim(cli: RbwCli, shimPath: string): Promise<void> {
  // rbw kills the agent on any `rbw config set`, which would discard a
  // freshly-unlocked vault key. Only write the config when the current
  // value actually differs from our shim path.
  let current: string | null = null;
  try {
    const cfg = await cli.readJson<RbwConfigSnapshot>(["config", "show"]);
    current = cfg?.pinentry ?? null;
  } catch { /* fall through and set */ }
  if (current === shimPath) return;
  await cli.text(["config", "set", "pinentry", shimPath]);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const prefs = getPrefs();
  const [state, setState] = useState<AuthState>({ kind: "loading" });

  const baseCli = useMemo(
    () => new RbwCli({ cliPath: resolveCliPath(prefs), serverCertsPath: prefs.serverCertsPath || undefined }),
    [prefs.cliPath, prefs.serverCertsPath],
  );

  const refresh = useCallback(async () => {
    try {
      if (prefs.serverUrl) {
        const last = await getLastAppliedServerUrl();
        if (last !== prefs.serverUrl) {
          try {
            await new Vault(baseCli).configServer(prefs.serverUrl);
            await setLastAppliedServerUrl(prefs.serverUrl);
          } catch { /* idempotent */ }
        }
      }
      const status = await new Vault(baseCli).status();
      if (!status || status.status === "unauthenticated") setState({ kind: "needs-login" });
      else if (status.status === "locked") setState({ kind: "needs-unlock" });
      else setState({ kind: "unlocked", vault: new Vault(baseCli), session: SENTINEL_SESSION });
    } catch (e) {
      if (e instanceof BwNotFound) setState({ kind: "needs-cli" });
      else setState({ kind: "needs-login" });
    }
  }, [baseCli, prefs.serverUrl]);

  const invalidateSession = useCallback(async () => {
    setState({ kind: "needs-unlock" });
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const withPinentry = useCallback(async <T,>(masterPassword: string, fn: (cli: RbwCli) => Promise<T>): Promise<T> => {
    const pinShim = resolvePinentryShim();
    const cliWithMP = baseCli.withEnv({ RBW_PINENTRY_VALUE: masterPassword });
    // Make the shim the persistent pinentry. `rbw config set` kills the
    // agent on every write, so we only write when the value actually
    // differs — that way unlocks across one Vicinae session don't
    // re-lock the vault. The shim is harmless in foreign processes
    // (RBW_PINENTRY_VALUE unset → empty password → unlock fails
    // cleanly), and users who want their original pinentry back can
    // run `rbw config set pinentry <name>` from a terminal.
    await ensurePinentryShim(baseCli, pinShim);
    return fn(cliWithMP);
  }, [baseCli]);

  const loginApiKey = useCallback(async (email: string, clientId: string, clientSecret: string, masterPassword: string) => {
    try {
      await new Vault(baseCli).configEmail(email);
      if (prefs.serverUrl) {
        try {
          await new Vault(baseCli).configServer(prefs.serverUrl);
          await setLastAppliedServerUrl(prefs.serverUrl);
        } catch { /* idempotent */ }
      }
      await withPinentry(masterPassword, async (cliWithMP) => {
        const v = new Vault(cliWithMP);
        await v.register(clientId, clientSecret);
        await v.login();
      });
      setState({ kind: "unlocked", vault: new Vault(baseCli), session: SENTINEL_SESSION });
    } catch (e) {
      if (e instanceof AuthFailed) {
        await showToast({ style: Toast.Style.Failure, title: "Invalid credentials" });
      } else {
        await showToast({ style: Toast.Style.Failure, title: "Login failed", message: String(e) });
      }
      throw e;
    }
  }, [baseCli, prefs.serverUrl, withPinentry]);

  const unlock = useCallback(async (masterPassword: string) => {
    try {
      await withPinentry(masterPassword, async (cliWithMP) => {
        await new Vault(cliWithMP).unlock(masterPassword);
      });
      const sessionedVault = new Vault(baseCli);
      if (prefs.syncOnLaunch) {
        const last = await getLastSync();
        const SYNC_TTL_MS = 12 * 60 * 60 * 1000;
        if (!last || Date.now() - last > SYNC_TTL_MS) {
          try { await sessionedVault.sync(); await setLastSync(); } catch { /* best effort */ }
        }
      }
      setState({ kind: "unlocked", vault: sessionedVault, session: SENTINEL_SESSION });
    } catch (e) {
      if (e instanceof AuthFailed || e instanceof Locked) {
        await showToast({ style: Toast.Style.Failure, title: "Invalid master password" });
      } else if (e instanceof NotLoggedIn) {
        setState({ kind: "needs-login" });
      } else {
        await showToast({ style: Toast.Style.Failure, title: "Unlock failed", message: String(e) });
      }
      throw e;
    }
  }, [baseCli, prefs.syncOnLaunch, withPinentry]);

  const lock = useCallback(async () => {
    try { await new Vault(baseCli).lock(); } catch { /* best effort */ }
    setState({ kind: "needs-unlock" });
  }, [baseCli]);

  const logout = useCallback(async () => {
    try { await new Vault(baseCli).logout(); } catch { /* best effort */ }
    setState({ kind: "needs-login" });
  }, [baseCli]);

  return (
    <Ctx.Provider value={{ state, unlock, lock, logout, loginApiKey, invalidateSession }}>{children}</Ctx.Provider>
  );
}

export function useSession(): SessionContextValue {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSession outside SessionProvider");
  return c;
}
