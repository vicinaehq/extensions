import { List, ActionPanel, Action, Clipboard, Icon, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { SessionProvider, useSession } from "./context/session-provider";
import { VaultProvider, useVault } from "./context/vault-provider";
import { ApiKeyLoginForm } from "./components/api-key-login-form";
import { UnlockForm } from "./components/unlock-form";
import type { Item } from "./types/bitwarden";
import { Vault } from "./api/vault";
import { loadTotpClassification, saveTotpClassification } from "./api/session-store";

const PROBE_CONCURRENCY = 8;

async function runWithLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const TOTP_PERIOD = 30;

function formatCode(c: string): string {
  if (c.length === 6) return `${c.slice(0, 3)} ${c.slice(3)}`;
  if (c.length === 8) return `${c.slice(0, 4)} ${c.slice(4)}`;
  return c;
}

function useSharedTotpClock(): { window: number; remaining: number } {
  // One interval per renderer instead of one-per-item. All TotpItems read
  // the same window/remaining values so countdowns stay in lockstep.
  const [now, setNow] = useState<number>(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return {
    window: Math.floor(now / TOTP_PERIOD),
    remaining: TOTP_PERIOD - (now % TOTP_PERIOD),
  };
}

function TotpItem({ item, vault, window, remaining }: { item: Item; vault: Vault; window: number; remaining: number }) {
  const [code, setCode] = useState<string>("…");
  const [lastFetched, setLastFetched] = useState<number>(-1);

  useEffect(() => {
    if (window === lastFetched) return;
    let cancelled = false;
    void (async () => {
      try {
        const c = await vault.getTotp(item.id);
        if (cancelled) return;
        if (c) setCode(c);
        setLastFetched(window);
      } catch { /* keep prior value */ }
    })();
    return () => { cancelled = true; };
  }, [item.id, vault, window, lastFetched]);

  return (
    <List.Item
      title={item.name}
      subtitle={code === "…" ? "…" : formatCode(code)}
      icon={Icon.Clock}
      accessories={[{ text: `${remaining}s`, icon: Icon.Hourglass }]}
      actions={
        <ActionPanel>
          <Action
            title="Copy Code"
            onAction={async () => {
              try {
                const c = code === "…" ? await vault.getTotp(item.id) : code;
                if (!c) {
                  await showToast({ style: Toast.Style.Failure, title: "No TOTP code for this item" });
                  return;
                }
                await Clipboard.copy(c, { concealed: true });
                await showToast({ style: Toast.Style.Success, title: "Copied", message: c });
              } catch (e) {
                await showToast({ style: Toast.Style.Failure, title: "Fetch failed", message: String(e) });
              }
            }}
          />
        </ActionPanel>
      }
    />
  );
}

// Module-level guard. With React effects firing twice (cache hydrate, then
// refresh) AuthList would otherwise launch two parallel probes that race
// each other in LocalStorage.
let probeInFlight = false;
let lastItemSignature = "";

function itemSignature(items: Item[]): string {
  const ids = items.filter((i) => i.type === 1).map((i) => i.id).sort();
  if (ids.length === 0) return "empty";
  return `${ids.length}:${ids[0]}:${ids[ids.length - 1]}`;
}

function AuthList() {
  const { state } = useSession();
  const { items, isLoading } = useVault();
  const [totpItems, setTotpItems] = useState<Item[]>([]);
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    if (state.kind !== "unlocked") return;
    const sig = itemSignature(items);
    if (sig === lastItemSignature) return;
    if (probeInFlight) return;
    lastItemSignature = sig;
    probeInFlight = true;
    const vault = state.vault;
    let cancelled = false;

    void (async () => {
      const { known, deny } = await loadTotpClassification();
      if (cancelled) return;
      console.log(`[rbw-ext] auth-cache loaded known=${known.size} deny=${deny.size}`);

      const candidates = items.filter((i) => i.type === 1);
      // Items list is empty on the very first render (VaultProvider hasn't
      // hydrated yet). Don't touch the persisted classification in that
      // window; the next render will run with real data.
      if (candidates.length === 0) {
        console.log(`[rbw-ext] auth-probe skip — items not hydrated yet`);
        probeInFlight = false;
        return;
      }
      const candidateIds = new Set(candidates.map((i) => i.id));
      const cachedHits = candidates.filter((i) => known.has(i.id));
      setTotpItems(cachedHits);

      const unclassified = candidates.filter((i) => !known.has(i.id) && !deny.has(i.id));
      if (unclassified.length === 0) {
        const trimmedKnown = new Set([...known].filter((id) => candidateIds.has(id)));
        const trimmedDeny = new Set([...deny].filter((id) => candidateIds.has(id)));
        if (trimmedKnown.size !== known.size || trimmedDeny.size !== deny.size) {
          await saveTotpClassification(trimmedKnown, trimmedDeny);
        }
        console.log(`[rbw-ext] auth-probe skip — all ${candidates.length} candidates already classified`);
        probeInFlight = false;
        return;
      }

      setProbing(true);
      const tStart = Date.now();
      console.log(`[rbw-ext] auth-probe start unclassified=${unclassified.length} cached-hits=${cachedHits.length}`);

      const newKnown = new Set(known);
      const newDeny = new Set(deny);
      let pendingHits: Item[] = [];
      let lastFlush = Date.now();
      let dirtySinceSave = 0;

      const persist = async () => {
        if (dirtySinceSave === 0) return;
        const trimmedKnown = new Set([...newKnown].filter((id) => candidateIds.has(id)));
        const trimmedDeny = new Set([...newDeny].filter((id) => candidateIds.has(id)));
        await saveTotpClassification(trimmedKnown, trimmedDeny);
        dirtySinceSave = 0;
      };

      await runWithLimit(unclassified, PROBE_CONCURRENCY, async (i) => {
        try {
          const code = await vault.getTotp(i.id);
          if (code) {
            newKnown.add(i.id);
            pendingHits.push(i);
          } else {
            newDeny.add(i.id);
          }
        } catch {
          newDeny.add(i.id);
        }
        dirtySinceSave += 1;
        // Flush UI + persisted classification incrementally so a closed
        // window doesn't lose progress for the next launch.
        if (pendingHits.length >= 8 || Date.now() - lastFlush > 500) {
          if (cancelled) return;
          const batch = pendingHits;
          pendingHits = [];
          lastFlush = Date.now();
          if (batch.length > 0) setTotpItems((prev) => [...prev, ...batch]);
        }
        if (dirtySinceSave >= 50) await persist();
      });

      if (!cancelled && pendingHits.length > 0) setTotpItems((prev) => [...prev, ...pendingHits]);
      await persist();
      console.log(`[rbw-ext] auth-probe total=${Date.now() - tStart}ms hits=${newKnown.size - known.size} misses=${newDeny.size - deny.size}`);
      if (!cancelled) setProbing(false);
      probeInFlight = false;
    })();
    return () => {
      cancelled = true;
      probeInFlight = false;
    };
  }, [items, state]);

  const clock = useSharedTotpClock();

  if (state.kind !== "unlocked") return <List isLoading />;
  return (
    <List isLoading={isLoading || probing} searchBarPlaceholder="Search authenticator…">
      {totpItems.map((item) => (
        <TotpItem key={item.id} item={item} vault={state.vault} window={clock.window} remaining={clock.remaining} />
      ))}
    </List>
  );
}

function Inner() {
  const { state, invalidateSession } = useSession();
  if (state.kind === "loading") return <List isLoading />;
  if (state.kind === "needs-login") return <ApiKeyLoginForm />;
  if (state.kind === "needs-unlock") return <UnlockForm />;
  if (state.kind === "needs-cli") return <List />;
  return <VaultProvider vault={state.vault} onSessionInvalid={() => void invalidateSession()}><AuthList /></VaultProvider>;
}

export default function Authenticator() {
  return <SessionProvider><Inner /></SessionProvider>;
}
