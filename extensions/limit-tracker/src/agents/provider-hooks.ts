import { getPreferenceValues } from "@vicinae/api";

import { loadAccounts } from "../accounts/storage.ts";
import { fetchClaudeUsage, readClaudeCredentials } from "../claude/fetcher.ts";
import type { ClaudeError, ClaudeUsage } from "../claude/types.ts";
import { buildCodexAccountCandidates } from "../codex/accounts.ts";
import { listCodexOAuthAccounts, parseAdditionalCodexHomes } from "../codex/auth.ts";
import { fetchCodexUsage } from "../codex/fetcher.ts";
import type { CodexError, CodexUsage } from "../codex/types.ts";
import { resolveCopilotAuthTokens, shouldFallbackToPreferenceToken } from "../copilot/auth.ts";
import { fetchCopilotUsage } from "../copilot/fetcher.ts";
import type { CopilotError, CopilotUsage } from "../copilot/types.ts";
import { fetchCursorUsage, resolveCursorCredential } from "../cursor/fetcher.ts";
import type { CursorError, CursorUsage } from "../cursor/types.ts";
import { resolveDeepSeekApiKey } from "../deepseek/auth.ts";
import { fetchDeepSeekUsage } from "../deepseek/fetcher.ts";
import type { DeepSeekError, DeepSeekUsage } from "../deepseek/types.ts";
import { fetchGeminiUsage, readGeminiAuthKey } from "../gemini/fetcher.ts";
import type { GeminiError, GeminiUsage } from "../gemini/types.ts";
import { fetchOpencodegoUsage, fetchOpencodegoUsageWithApiKey } from "../opencode-go/fetcher.ts";
import type { OpencodegoError, OpencodegoUsage } from "../opencode-go/types.ts";
import { resolveZaiAuthTokens } from "../zai/auth.ts";
import { fetchZaiUsage, ZAI_OPENCODE_KEY } from "../zai/fetcher.ts";
import type { ZaiError, ZaiUsage } from "../zai/types.ts";
import { createAccountsHook, createUsageHook } from "./hooks.ts";

/**
 * Native Vicinae provider hooks for the core 8 providers.
 * Every fetcher/auth module stays free of @vicinae/api so the plain Node test
 * runner can exercise it; this file is the only place that wires preferences,
 * React hook lifetimes, and caching together.
 */

type SharedPrefs = {
  additionalCodexHomes?: string;
  copilotAuthToken?: string;
  cursorCookieHeader?: string;
  deepseekApiKey?: string;
  opencodegoApiKey?: string;
  opencodegoWorkspaceId?: string;
  opencodegoAuthCookie?: string;
  zaiApiToken?: string;
};

function prefValue(key: keyof SharedPrefs): string {
  return getPreferenceValues<SharedPrefs>()[key]?.trim() || "";
}

export const useClaudeUsage = createUsageHook<ClaudeUsage, ClaudeError>({
  agentId: "claude",
  resolveAuthKey: async () => readClaudeCredentials().credentials?.accessToken ?? "",
  fetcher: async () => {
    const { credentials, error } = readClaudeCredentials();
    if (!credentials) return { usage: null, error };
    return fetchClaudeUsage(credentials);
  },
});

export const useCopilotUsage = createUsageHook<CopilotUsage, CopilotError>({
  agentId: "copilot",
  resolveAuthKey: async () => {
    const { primaryToken, preferenceToken } = await resolveCopilotTokens();
    return `${primaryToken ?? ""}\n${preferenceToken ?? ""}`;
  },
  fetcher: async () => {
    const { primaryToken, localToken, preferenceToken } = await resolveCopilotTokens();
    if (!primaryToken) {
      return {
        usage: null,
        error: {
          type: "not_configured",
          message: "Copilot is not configured. Set GH_TOKEN/GITHUB_TOKEN or add a token in extension settings.",
        },
      };
    }
    let result = await fetchCopilotUsage(primaryToken);
    if (
      preferenceToken &&
      shouldFallbackToPreferenceToken({ localToken, preferenceToken, errorType: result.error?.type })
    ) {
      result = await fetchCopilotUsage(preferenceToken);
    }
    return result;
  },
});

export const useCursorUsage = createUsageHook<CursorUsage, CursorError>({
  agentId: "cursor",
  resolveAuthKey: async () => resolveCursorCredential(prefValue("cursorCookieHeader"))?.cookieHeader ?? "",
  fetcher: () => fetchCursorUsage(prefValue("cursorCookieHeader")),
});

export const useDeepSeekUsage = createUsageHook<DeepSeekUsage, DeepSeekError>({
  agentId: "deepseek",
  resolveAuthKey: async () => (await resolveDeepSeekApiKey(prefValue("deepseekApiKey"))) ?? "",
  fetcher: async () => {
    const apiKey = await resolveDeepSeekApiKey(prefValue("deepseekApiKey"));
    if (!apiKey) {
      return {
        usage: null,
        error: {
          type: "not_configured",
          message:
            "DeepSeek API key not configured. Add it in extension settings, log in through OpenCode, or set DEEPSEEK_API_KEY.",
        },
      };
    }
    return fetchDeepSeekUsage(apiKey);
  },
});

export const useGeminiUsage = createUsageHook<GeminiUsage, GeminiError>({
  agentId: "gemini",
  resolveAuthKey: async () => readGeminiAuthKey(),
  fetcher: fetchGeminiUsage,
});

export const useOpencodegoUsage = createUsageHook<OpencodegoUsage, OpencodegoError>({
  agentId: "opencode-go",
  resolveAuthKey: async () =>
    `${prefValue("opencodegoApiKey")}\n${prefValue("opencodegoWorkspaceId")}\n${prefValue("opencodegoAuthCookie")}`,
  fetcher: async () => {
    const apiKey = prefValue("opencodegoApiKey");
    const workspaceId = prefValue("opencodegoWorkspaceId");
    const authCookie = prefValue("opencodegoAuthCookie");

    if (apiKey) {
      return fetchOpencodegoUsageWithApiKey(apiKey);
    }
    if (workspaceId && authCookie) {
      return fetchOpencodegoUsage(workspaceId, authCookie);
    }
    const envApiKey = process.env.OPENCODE_API_KEY?.trim();
    if (envApiKey) {
      return fetchOpencodegoUsageWithApiKey(envApiKey);
    }
    return {
      usage: null,
      error: {
        type: "not_configured",
        message: "OpenCode Go not configured. Add your API key in settings or set OPENCODE_API_KEY.",
      },
    };
  },
});

export const useCodexAccounts = createAccountsHook<
  CodexUsage,
  CodexError,
  ReturnType<typeof buildCodexAccountCandidates>[number]
>({
  agentId: "codex",
  getAccounts: async () => {
    const defaultAccounts = listCodexOAuthAccounts();
    const additionalAccounts = parseAdditionalCodexHomes(prefValue("additionalCodexHomes")).flatMap(
      (codexHome, homeIndex) =>
        listCodexOAuthAccounts({ codexHome }).map((account) => ({
          ...account,
          id: `codex-home-${homeIndex}-${account.id}`,
        })),
    );
    return buildCodexAccountCandidates(
      [...defaultAccounts, ...additionalAccounts],
      await loadAccounts("codex"),
    );
  },
  fetcher: async (account) => {
    if (account.needsAccountId) {
      return {
        usage: null,
        error: {
          type: "not_configured",
          message: "Add the ChatGPT account ID for this manual Codex account, or run 'codex login'.",
        },
      };
    }
    return fetchCodexUsage(account.token, account.accountId);
  },
  resolveAccountAuthKey: (account) =>
    [account.token, account.accountId ?? "", String(account.needsAccountId)].join("\n"),
  noAccountsError: {
    type: "not_configured",
    message: "Codex is not configured. Run 'codex login' or add an account via Manage Accounts.",
  },
});

export const useZaiAccounts = createAccountsHook<
  ZaiUsage,
  ZaiError,
  { id: string; label: string; token: string }
>({
  agentId: "zai",
  getAccounts: async () => {
    const accounts = [...(await loadAccounts("zai"))];
    const preferenceToken = prefValue("zaiApiToken");
    const { allTokens: autoTokens } = await resolveZaiAuthTokens({ preferenceToken });
    for (let i = 0; i < autoTokens.length; i++) {
      const token = autoTokens[i];
      if (!accounts.some((account) => account.token === token)) {
        const isManualPref = i === 0 && preferenceToken !== "";
        const id = isManualPref ? "zai-pref" : i === 0 ? "zai-auto" : `zai-auto-${i}`;
        const label = isManualPref ? "Manual" : "Auto-detected";
        accounts.push({ id, label, token });
      }
    }
    return accounts;
  },
  fetcher: (account) => fetchZaiUsage(account.token),
  openCodeKey: ZAI_OPENCODE_KEY,
  noAccountsError: {
    type: "not_configured",
    message: "z.ai token not configured. Add an account via Manage Accounts or set ZAI_API_KEY.",
  },
});

async function resolveCopilotTokens() {
  return resolveCopilotAuthTokens({ preferenceToken: prefValue("copilotAuthToken") });
}
