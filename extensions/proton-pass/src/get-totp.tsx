import { useEffect, useRef, useState } from "react";
import { Action, ActionPanel, Color, getPreferenceValues, Icon, List, showToast, Toast } from "@vicinae/api";
import { clearCache, getCachedSnapshot, setCachedSnapshot } from "./cache";
import { copyProtected } from "./clipboard";
import { getTotp, listVaultsAndItems, PassItem } from "./pass-cli";

type Preferences = {
  enableBackgroundRefresh?: boolean;
};

function timeStep(): number {
  return Math.floor(Date.now() / 30_000);
}

function secondsRemaining(): number {
  const seconds = Math.floor(Date.now() / 1000);
  return 30 - (seconds % 30);
}

function itemKey(item: PassItem): string {
  return `${item.shareId}:${item.itemId}`;
}

function timerColor(seconds: number): Color {
  if (seconds > 10) return Color.Green;
  if (seconds > 5) return Color.Yellow;
  return Color.Red;
}

export default function Command() {
  const [items, setItems] = useState<PassItem[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState(secondsRemaining());
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const itemsRef = useRef<PassItem[]>([]);
  const stepRef = useRef(timeStep());
  const refreshRef = useRef(false);
  const backgroundRefresh = getPreferenceValues<Preferences>().enableBackgroundRefresh !== false;

  async function refreshCodes(source: PassItem[] = itemsRef.current): Promise<void> {
    if (refreshRef.current) return;
    refreshRef.current = true;
    setRefreshing(true);
    try {
      const entries = await Promise.all(
        source.filter((item) => item.hasTotp).map(async (item) => {
          try {
            return [itemKey(item), await getTotp(item)] as const;
          } catch {
            return undefined;
          }
        }),
      );
      setCodes(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry))));
    } finally {
      refreshRef.current = false;
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadItems(): Promise<void> {
      const cached = await getCachedSnapshot();
      if (cached && active) {
        setItems(cached.data.items);
        itemsRef.current = cached.data.items;
        void refreshCodes(cached.data.items);
        if (!cached.isStale || !backgroundRefresh) {
          setLoading(false);
          return;
        }
      }

      try {
        const fresh = await listVaultsAndItems();
        await setCachedSnapshot(fresh);
        if (active) {
          setItems(fresh.items);
          itemsRef.current = fresh.items;
          await refreshCodes(fresh.items);
        }
      } catch (reason: unknown) {
        const message = reason instanceof Error ? reason.message : String(reason);
        if (!cached && active) setError(message);
        if (/authenticated|logged in|session/i.test(message)) await clearCache();
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadItems();
    const interval = setInterval(() => {
      setRemaining(secondsRemaining());
      const nextStep = timeStep();
      if (nextStep !== stepRef.current) {
        stepRef.current = nextStep;
        void refreshCodes();
      }
    }, 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [backgroundRefresh]);

  async function copy(item: PassItem): Promise<void> {
    try {
      const code = codes[itemKey(item)] ?? await getTotp(item);
      await copyProtected(code);
      await showToast({ style: Toast.Style.Success, title: `${item.title} TOTP copied` });
    } catch (reason: unknown) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to copy TOTP code",
        message: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }

  return (
    <List isLoading={loading || refreshing} searchBarPlaceholder="Search all items, then choose one for TOTP...">
      {error ? (
        <List.EmptyView icon={Icon.Warning} title="Unable to load Proton Pass items" description={error} />
      ) : items.length === 0 && !loading ? (
        <List.EmptyView icon={Icon.Clock} title="No Proton Pass items found" />
      ) : (
        <List.Section title="Proton Pass items" subtitle={refreshing ? "Refreshing…" : `Codes refresh in ${remaining}s`}>
          {items.map((item) => {
            const code = codes[itemKey(item)];
            return (
              <List.Item
                key={itemKey(item)}
                title={item.title}
                subtitle={item.vaultName}
                keywords={[item.title, item.username ?? "", item.email ?? "", item.vaultName]}
                icon={item.hasTotp ? Icon.Clock : Icon.Key}
                accessories={item.hasTotp
                  ? [{ tag: { value: code ?? "---", color: timerColor(remaining) } }, { text: `${remaining}s`, icon: Icon.Clock }]
                  : [{ text: "Try TOTP" }]}
                actions={
                  <ActionPanel>
                    <Action title="Copy TOTP Code" icon={Icon.CopyClipboard} onAction={() => void copy(item)} />
                    <Action title="Refresh Codes" icon={Icon.ArrowClockwise} onAction={() => void refreshCodes()} />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}
    </List>
  );
}
