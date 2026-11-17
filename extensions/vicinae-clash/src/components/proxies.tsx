import { Action, ActionPanel, Color, Icon, List, showToast, Toast } from "@vicinae/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getProxies, getProxyDelay, selectProxy } from "../lib/clash-api";
import { showError } from "../lib/toast";
import type { ClashProxy } from "../types";

const GROUP_TYPES = new Set(["Selector", "URLTest", "Fallback", "LoadBalance", "Relay"]);
const UNTESTABLE_TYPES = new Set(["Direct", "Reject", "RejectDrop", "Pass", "PassRule"]);
const TEST_BATCH_SIZE = 6;

function delayColor(delay: number): Color {
  if (delay <= 200) return Color.Green;
  if (delay <= 500) return Color.Yellow;
  if (delay <= 1000) return Color.Orange;
  return Color.Red;
}

function latestDelay(proxy: ClashProxy | undefined): number | undefined {
  const delay = proxy?.history?.at(-1)?.delay;
  return Number.isFinite(delay) && delay !== undefined && delay > 0 ? delay : undefined;
}

function proxySubtitle(proxy: ClashProxy | undefined): string | undefined {
  if (!proxy) return undefined;
  return [proxy.type, proxy["provider-name"] || undefined, proxy.udp === true ? "UDP" : undefined]
    .filter(Boolean)
    .join(" · ");
}

export default function Proxies() {
  const [proxies, setProxies] = useState<ClashProxy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTestingDelays, setIsTestingDelays] = useState(false);
  const [delays, setDelays] = useState<Map<string, number | null>>(new Map());

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setProxies(await getProxies());
    } catch (error) {
      await showError("Could Not Load Proxies", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  async function choose(group: ClashProxy, name: string) {
    setIsLoading(true);
    try {
      await selectProxy(group.name, name);
      await load();
      await showToast({ style: Toast.Style.Success, title: "Proxy Selected", message: `${group.name}: ${name}` });
    } catch (error) {
      await showError("Could Not Select Proxy", error);
    } finally {
      setIsLoading(false);
    }
  }

  const groups = useMemo(() => {
    const globalOrder = proxies.find(({ name }) => name === "GLOBAL")?.all ?? [];
    return proxies
      .filter(({ type, all }) => GROUP_TYPES.has(type) && Array.isArray(all))
      .sort((left, right) => {
        const leftIndex = globalOrder.indexOf(left.name);
        const rightIndex = globalOrder.indexOf(right.name);
        if (leftIndex < 0 && rightIndex < 0) return left.name.localeCompare(right.name);
        if (leftIndex < 0) return 1;
        if (rightIndex < 0) return -1;
        return leftIndex - rightIndex;
      });
  }, [proxies]);

  const testableNodes = useMemo(() => {
    const proxiesByName = new Map(proxies.map((proxy) => [proxy.name, proxy]));
    const names = new Set(groups.flatMap((group) => group.all ?? []));
    return [...names].filter((name) => {
      const proxy = proxiesByName.get(name);
      return proxy && !Array.isArray(proxy.all) && !UNTESTABLE_TYPES.has(proxy.type);
    });
  }, [groups, proxies]);

  async function testAllDelays() {
    if (testableNodes.length === 0) {
      await showToast({ style: Toast.Style.Failure, title: "No Testable Proxy Nodes" });
      return;
    }

    setIsTestingDelays(true);
    setDelays(new Map());
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Testing Proxy Delays",
      message: `0 / ${testableNodes.length}`,
    });
    let completed = 0;
    let succeeded = 0;

    try {
      for (let start = 0; start < testableNodes.length; start += TEST_BATCH_SIZE) {
        const batch = testableNodes.slice(start, start + TEST_BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (name) => {
            try {
              return [name, await getProxyDelay(name)] as const;
            } catch {
              return [name, null] as const;
            }
          }),
        );
        setDelays((current) => {
          const next = new Map(current);
          for (const [name, delay] of results) next.set(name, delay);
          return next;
        });
        completed += results.length;
        succeeded += results.filter(([, delay]) => delay !== null).length;
        toast.message = `${completed} / ${testableNodes.length}`;
        await toast.update();
      }

      toast.style = succeeded === 0 ? Toast.Style.Failure : Toast.Style.Success;
      toast.title = succeeded === testableNodes.length ? "Delay Test Complete" : "Delay Test Partially Complete";
      toast.message = `${succeeded} / ${testableNodes.length} nodes responded`;
      await toast.update();
    } finally {
      setIsTestingDelays(false);
    }
  }

  async function testDelay(name: string) {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Testing Proxy Delay",
      message: name,
    });
    try {
      const delay = await getProxyDelay(name);
      setDelays((current) => new Map(current).set(name, delay));
      toast.style = Toast.Style.Success;
      toast.title = "Proxy Delay Tested";
      toast.message = `${name}: ${delay} ms`;
      await toast.update();
    } catch (error) {
      setDelays((current) => new Map(current).set(name, null));
      toast.hide();
      await showError(`Could Not Test ${name}`, error);
    }
  }

  return (
    <List isLoading={isLoading || isTestingDelays} searchBarPlaceholder="Search proxies...">
      {groups.map((group) => (
        <List.Section key={group.name} title={group.name} subtitle={group.type}>
          {(group.all ?? []).map((name) => {
            const isCurrent = name === group.now;
            const isSelectable = group.type === "Selector";
            const proxy = proxies.find((item) => item.name === name);
            const isTestable = proxy && !Array.isArray(proxy.all) && !UNTESTABLE_TYPES.has(proxy.type);
            const wasTested = delays.has(name);
            const testedDelay = delays.get(name);
            const delay = wasTested ? testedDelay : latestDelay(proxy);
            return (
              <List.Item
                key={`${group.name}-${name}`}
                icon={{
                  source: isCurrent ? Icon.CheckCircle : Icon.Circle,
                  tintColor: isCurrent ? Color.Green : undefined,
                }}
                title={name}
                subtitle={proxySubtitle(proxy)}
                keywords={[group.name, group.type, proxy?.type ?? "", proxy?.["provider-name"] ?? ""]}
                accessories={[
                  ...(delay !== undefined || wasTested
                    ? [
                        {
                          tag:
                            delay == null
                              ? { value: "Failed", color: Color.Red }
                              : { value: `${delay} ms`, color: delayColor(delay) },
                        },
                      ]
                    : []),
                ]}
                actions={
                  <ActionPanel>
                    {isSelectable ? (
                      <Action title="Select Proxy" icon={Icon.Check} onAction={() => void choose(group, name)} />
                    ) : null}
                    {isTestable ? (
                      <Action title="Test This Proxy" icon={Icon.Stopwatch} onAction={() => void testDelay(name)} />
                    ) : null}
                    <Action title="Test All Proxy Delays" icon={Icon.Stopwatch} onAction={() => void testAllDelays()} />
                    <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={() => void load()} />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      ))}
    </List>
  );
}
