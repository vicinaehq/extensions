import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Vault } from "../api/vault";
import { loadCache, saveCache } from "../api/session-store";
import { Locked, AuthFailed, NotLoggedIn } from "../api/errors";
import type { Item, Folder } from "../types/bitwarden";

interface VaultContextValue {
  items: Item[];
  folders: Folder[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<VaultContextValue | null>(null);

export function VaultProvider({
  vault,
  onSessionInvalid,
  children,
}: {
  vault: Vault;
  onSessionInvalid?: () => void;
  children: ReactNode;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const [is, fs] = await Promise.all([vault.listItems(), vault.listFolders()]);
      const items = is ?? [];
      const folders = fs ?? [];
      setItems(items);
      setFolders(folders);
      void saveCache(items, folders);
    } catch (e) {
      if (e instanceof Locked || e instanceof AuthFailed || e instanceof NotLoggedIn) {
        onSessionInvalid?.();
        return;
      }
      // network or other transient errors — keep cached data, don't disturb UI
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const cached = await loadCache();
      if (cancel) return;
      if (cached) {
        setItems(cached.items);
        setFolders(cached.folders);
        setLoading(false);
      }
      const FRESH_MS = 10 * 60 * 1000;
      if (cached && Date.now() - cached.mtime < FRESH_MS) return;
      await refresh();
    })();
    return () => { cancel = true; };
  }, [vault]);

  return <Ctx.Provider value={{ items, folders, isLoading, refresh }}>{children}</Ctx.Provider>;
}

export function useVault(): VaultContextValue {
  const c = useContext(Ctx);
  if (!c) throw new Error("useVault outside VaultProvider");
  return c;
}
