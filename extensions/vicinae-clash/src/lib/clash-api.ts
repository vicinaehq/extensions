import type { Backend, ClashProxy, Config, Mode, Rule, Version } from "../types";
import { getCurrentBackend } from "./backends";

export class NoBackendError extends Error {
  constructor() {
    super("No Clash backend is configured. Open Backends to add one.");
  }
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

export async function buildWebSocketUrl(endpoint: string, params: Record<string, string> = {}): Promise<string> {
  const backend = await getCurrentBackend();
  if (!backend) throw new NoBackendError();
  const url = new URL(`${backend.url}${endpoint}`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (backend.secret) url.searchParams.set("token", backend.secret);
  return url.toString();
}

export async function requestBackend<T>(backend: Backend, endpoint: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${backend.url}${endpoint}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(backend.secret ? { Authorization: `Bearer ${backend.secret}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.text()).trim();
    } catch {
      // Ignore an unreadable error body.
    }
    throw new Error(`Clash API ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function request<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
  const backend = await getCurrentBackend();
  if (!backend) throw new NoBackendError();
  return requestBackend<T>(backend, endpoint, init);
}

export async function getConfig(): Promise<Config> {
  return request<Config>("/configs");
}

export async function getVersion(): Promise<Version> {
  return request<Version>("/version");
}

export async function setMode(mode: Mode): Promise<void> {
  await request<void>("/configs", { method: "PATCH", body: JSON.stringify({ mode }) });
}

export async function getProxies(): Promise<ClashProxy[]> {
  const data = await request<{ proxies: Record<string, Omit<ClashProxy, "name">> }>("/proxies");
  return Object.entries(data.proxies).map(([name, proxy]) => ({ name, ...proxy }));
}

export async function selectProxy(group: string, name: string): Promise<void> {
  await request<void>(`/proxies/${encodePathSegment(group)}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export async function getProxyDelay(
  name: string,
  timeout = 5000,
  testUrl = "https://www.gstatic.com/generate_204",
): Promise<number> {
  const params = new URLSearchParams({ timeout: String(timeout), url: testUrl });
  const data = await request<{ delay: number }>(`/proxies/${encodePathSegment(name)}/delay?${params.toString()}`);
  if (!Number.isFinite(data.delay)) throw new Error(`Invalid delay returned for ${name}.`);
  return data.delay;
}

export async function getRules(): Promise<Rule[]> {
  return (await request<{ rules: Rule[] }>("/rules")).rules;
}

export async function getRuleProviderCounts(): Promise<Record<string, number>> {
  const data = await request<{ providers: Record<string, { ruleCount?: number }> }>("/providers/rules");
  return Object.fromEntries(
    Object.entries(data.providers).flatMap(([name, provider]) =>
      typeof provider.ruleCount === "number" && provider.ruleCount >= 0 ? [[name, provider.ruleCount]] : [],
    ),
  );
}

export async function setRuleDisabled(index: number, disabled: boolean): Promise<void> {
  await request<void>("/rules/disable", {
    method: "PATCH",
    body: JSON.stringify({ [index]: disabled }),
  });
}

export async function closeConnection(id: string): Promise<void> {
  await request<void>(`/connections/${encodePathSegment(id)}`, { method: "DELETE" });
}

export async function closeAllConnections(): Promise<void> {
  await request<void>("/connections", { method: "DELETE" });
}

export async function flushDnsCache(): Promise<void> {
  await request<void>("/cache/dns/flush", { method: "POST" });
}

export async function flushFakeIpCache(): Promise<void> {
  await request<void>("/cache/fakeip/flush", { method: "POST" });
}

export async function updateGeoDatabase(): Promise<void> {
  await request<void>("/upgrade/geo", {
    method: "POST",
    body: JSON.stringify({ path: "", payload: "" }),
  });
}
