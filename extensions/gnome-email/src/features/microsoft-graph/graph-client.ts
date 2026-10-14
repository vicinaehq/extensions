import { getCredentials } from "../../goa";
import type { GraphMailAccount } from "../../types";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";

type GraphError = { error?: { message?: string } };

export async function graphRequest<T>(
  account: GraphMailAccount,
  endpoint: string,
  init?: RequestInit,
): Promise<T> {
  const { accessToken } = await getCredentials(account);
  if (!accessToken) throw new Error(`${account.name} did not provide a Microsoft Graph access token`);

  const response = await fetch(endpoint.startsWith("https://") ? endpoint : `${GRAPH_ROOT}${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as GraphError;
    throw new Error(payload.error?.message || `Microsoft Graph request failed (${response.status})`);
  }

  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

export async function graphCollection<T>(account: GraphMailAccount, endpoint: string): Promise<T[]> {
  const values: T[] = [];
  let next: string | undefined = endpoint;

  while (next) {
    const page: { value?: T[]; "@odata.nextLink"?: string } = await graphRequest(account, next);
    values.push(...(page.value ?? []));
    next = page["@odata.nextLink"];
  }

  return values;
}
