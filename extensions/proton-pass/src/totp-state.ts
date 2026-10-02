import { useCallback, useEffect, useRef, useState } from "react";
import { Color } from "@vicinae/api";
import { getTotp, PassItem } from "./pass-cli";

export function totpItemKey(item: PassItem): string {
  return `${item.shareId}:${item.itemId}`;
}

export function totpTimerColor(seconds: number): Color {
  if (seconds > 10) return Color.Green;
  if (seconds > 5) return Color.Yellow;
  return Color.Red;
}

function currentStep(): number {
  return Math.floor(Date.now() / 30_000);
}

function secondsRemaining(): number {
  return 30 - (Math.floor(Date.now() / 1000) % 30);
}

export function useTotpCodes(items: PassItem[]): {
  codes: Record<string, string>;
  remaining: number;
  refreshing: boolean;
  refresh: () => Promise<void>;
} {
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState(secondsRemaining());
  const [refreshing, setRefreshing] = useState(false);
  const itemsRef = useRef<PassItem[]>(items);
  const stepRef = useRef(currentStep());
  const refreshingRef = useRef(false);

  const refresh = useCallback(async (source: PassItem[] = itemsRef.current): Promise<void> => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const entries = await Promise.all(
        source.filter((item) => item.hasTotp).map(async (item) => {
          try {
            return [totpItemKey(item), await getTotp(item)] as const;
          } catch {
            return undefined;
          }
        }),
      );
      setCodes(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry))));
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    itemsRef.current = items;
    void refresh(items);
  }, [items, refresh]);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(secondsRemaining());
      const nextStep = currentStep();
      if (nextStep !== stepRef.current) {
        stepRef.current = nextStep;
        void refresh();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { codes, remaining, refreshing, refresh };
}
