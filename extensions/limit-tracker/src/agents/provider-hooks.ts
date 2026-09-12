import { getPreferenceValues } from "@vicinae/api";

import { loadAccounts } from "../accounts/storage.ts";
import { fetchAihubmixUsage, resolveAihubmixApiKey } from "../aihubmix/fetcher.ts";
import type { AihubmixError, AihubmixUsage } from "../aihubmix/types.ts";
import { fetchAmpUsage, resolveAmpApiKey } from "../amp/fetcher.ts";
import type { AmpError, AmpUsage } from "../amp/types.ts";
import { fetchAntigravityUsage } from "../antigravity/fetcher.ts";
import type { AntigravityError, AntigravityUsage } from "../antigravity/types.ts";
import { fetchClaudeUsage, readClaudeCredentials } from "../claude/fetcher.ts";
import type { ClaudeError, ClaudeUsage } from "../claude/types.ts";
import { fetchClinepassUsage, resolveClinepassApiKey } from "../clinepass/fetcher.ts";
import type { ClinepassError, ClinepassUsage } from "../clinepass/types.ts";
import { resolveCommandcodeApiKey } from "../commandcode/auth.ts";
import { fetchCommandcodeUsage } from "../commandcode/fetcher.ts";
import type { CommandcodeError, CommandcodeUsage } from "../commandcode/types.ts";
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
import { fetchDevinUsage, fetchDevinWebOnly, resolveDevinApiKey, resolveDevinSession } from "../devin/fetcher.ts";
import type { DevinError, DevinUsage } from "../devin/types.ts";
import { fetchDroidUsage, resolveFactoryApiKey } from "../droid/fetcher.ts";
import type { DroidError, DroidUsage } from "../droid/types.ts";
import { fetchGeminiUsage, readGeminiAuthKey } from "../gemini/fetcher.ts";
import type { GeminiError, GeminiUsage } from "../gemini/types.ts";
import { fetchGrokUsage, resolveGrokCredential } from "../grok/fetcher.ts";
import type { GrokError, GrokUsage } from "../grok/types.ts";
import { fetchKimiUsage, resolveKimiToken } from "../kimi/fetcher.ts";
import type { KimiError, KimiUsage } from "../kimi/types.ts";
import { fetchMinimaxUsage, resolveMinimaxApiKey, resolveMinimaxcnApiKey } from "../minimax/fetcher.ts";
import type { MinimaxError, MinimaxUsage } from "../minimax/types.ts";
import { fetchOpencodegoUsage, fetchOpencodegoUsageWithApiKey } from "../opencode-go/fetcher.ts";
import type { OpencodegoError, OpencodegoUsage } from "../opencode-go/types.ts";
import { findOmpAgentDir, getOmpApiKey, getOmpOAuth, isOmpTokenFresh, readOmpUsageSnapshots } from "../omp/store.ts";
import { fetchSyntheticUsage, resolveSyntheticApiKey } from "../synthetic/fetcher.ts";
import type { SyntheticError, SyntheticUsage } from "../synthetic/types.ts";
import { resolveZaiAuthTokens } from "../zai/auth.ts";
import { fetchZaiUsage, ZAI_OPENCODE_KEY } from "../zai/fetcher.ts";
import type { ZaiError, ZaiUsage } from "../zai/types.ts";
import { createAccountsHook, createUsageHook } from "./hooks.ts";
import type { AgentVisibilityPreferences } from "./types.ts";

/**
 * Native Vicinae provider hooks for the core 8 providers.
 * Every fetcher/auth module stays free of @vicinae/api so the plain Node test
 * runner can exercise it; this file is the only place that wires preferences,
 * React hook lifetimes, and caching together.
 */

type SharedPrefs = {
  additionalCodexHomes?: string;
  aihubmixApiKey?: string;
  ampApiKey?: string;
  clinepassApiKey?: string;
  commandcodeApiKey?: string;
  copilotAuthToken?: string;
  cursorCookieHeader?: string;
  deepseekApiKey?: string;
  devinApiKey?: string;
  devinSessionToken?: string;
  devinOrganization?: string;
  droidApiKey?: string;
  grokBearerToken?: string;
  kimiCodeApiKey?: string;
  minimaxApiKey?: string;
  minimaxcnApiKey?: string;
  opencodegoApiKey?: string;
  opencodegoWorkspaceId?: string;
  opencodegoAuthCookie?: string;
  syntheticApiKey?: string;
  zaiApiToken?: string;
};

function prefValue(key: keyof SharedPrefs): string {
  return getPreferenceValues<SharedPrefs>()[key]?.trim() || "";
}

function ompEnabled(): boolean {
  return getPreferenceValues<AgentVisibilityPreferences>().useOmpHarness ?? true;
}

export const useClaudeUsage = createUsageHook<ClaudeUsage, ClaudeError>({
  agentId: "claude",
  resolveAuthKey: async () => (await readClaudeCredentials(ompEnabled())).credentials?.accessToken ?? "",
  fetcher: async () => {
    const { credentials, error } = await readClaudeCredentials(ompEnabled());
    if (!credentials) return { usage: null, error };
    const result = await fetchClaudeUsage(credentials);
    if (result.usage && credentials.source === "omp") {
      return { usage: { ...result.usage, viaOmp: true }, error: result.error };
    }
    return result;
  },
});

export const useAntigravityUsage = createUsageHook<AntigravityUsage, AntigravityError>({
  agentId: "antigravity",
  resolveAuthKey: async () => {
    if (!ompEnabled()) return "";
    return (await readOmpUsageSnapshots("google-antigravity"))
      ?.map((entry) => `${entry.limitId}:${entry.usedFraction}:${entry.status}`)
      .join("|") ?? "";
  },
  fetcher: async () => fetchAntigravityUsage(undefined, ompEnabled()),
});

export const useCommandcodeUsage = createUsageHook<CommandcodeUsage, CommandcodeError>({
  agentId: "commandcode",
  resolveAuthKey: async () => (await resolveCommandcodeApiKey(prefValue("commandcodeApiKey"))) ?? "",
  fetcher: async () => {
    const apiKey = await resolveCommandcodeApiKey(prefValue("commandcodeApiKey"));
    if (!apiKey) {
      return {
        usage: null,
        error: {
          type: "not_configured",
          message: "Command Code not configured. Run `cmd login`, set COMMANDCODE_API_KEY, or add a key in extension settings.",
        },
      };
    }
    return fetchCommandcodeUsage(apiKey);
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
  resolveAuthKey: async () => (await resolveCursorCredential(prefValue("cursorCookieHeader")))?.cookieHeader ?? "",
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

export const useDevinUsage = createUsageHook<DevinUsage, DevinError>({
  agentId: "devin",
  resolveAuthKey: async () =>
    [
      (await resolveDevinApiKey(prefValue("devinApiKey"))) ?? "",
      resolveDevinSession(prefValue("devinSessionToken"), prefValue("devinOrganization"))?.token ?? "",
      prefValue("devinOrganization"),
    ].join("\n"),
  fetcher: async () => {
    const apiKey = await resolveDevinApiKey(prefValue("devinApiKey"));
    const session = resolveDevinSession(prefValue("devinSessionToken"), prefValue("devinOrganization"));
    if (!apiKey && !session) {
      return {
        usage: null,
        error: {
          type: "not_configured",
          message:
            "Devin not configured. Set the session token + organization (self-serve), or a cog_ service-user key (Enterprise ACU), in extension settings.",
        },
      };
    }
    // Session token alone → web-only daily/weekly quota (any plan).
    if (!apiKey) return fetchDevinWebOnly(session!);
    // Enterprise key (+optional session) → ACU limits merged with web quota.
    return fetchDevinUsage(apiKey, session);
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
    // oh-my-pi harness login (`omp auth-broker login opencode-go`) as fallback.
    const ompApiKey = await getOmpApiKey("opencode-go", undefined, ompEnabled());
    if (ompApiKey) {
      const result = await fetchOpencodegoUsageWithApiKey(ompApiKey);
      if (result.usage) {
        return { usage: { ...result.usage, viaOmp: true }, error: result.error };
      }
      return result;
    }
    return {
      usage: null,
      error: {
        type: "not_configured",
        message: "OpenCode Go not configured. Add your API key in settings, set OPENCODE_API_KEY, or log in via omp.",
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
    // oh-my-pi harness login (`omp auth-broker login openai-codex`) as fallback.
    // Skipped when a native login already covers the same account ID, and when
    // the harness token is expired (it cannot be refreshed from here).
    const nativeAccountIds = new Set(
      [...defaultAccounts, ...additionalAccounts].map((account) => account.accountId?.trim()).filter(Boolean),
    );
    const ompAgentDir = ompEnabled() ? findOmpAgentDir() : null;
    const omp = ompAgentDir ? await getOmpOAuth("openai-codex") : null;
    const ompAccounts =
      ompAgentDir && omp && isOmpTokenFresh(omp) && omp.accountId && !nativeAccountIds.has(omp.accountId)
        ? [
            {
              id: "codex-omp",
              label: omp.email ?? "omp",
              token: omp.access,
              accountId: omp.accountId,
              userId: null,
              source: "stored" as const,
              authFilePath: ompAgentDir,
            },
          ]
        : [];
    return buildCodexAccountCandidates(
      [...defaultAccounts, ...additionalAccounts, ...ompAccounts],
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
    const result = await fetchCodexUsage(account.token, account.accountId);
    if (account.id === "codex-omp") {
      if (result.error?.type === "unauthorized") {
        return {
          usage: null,
          error: {
            type: "unauthorized" as const,
            message: "omp Codex token expired or invalid. Re-login with `omp auth-broker login openai-codex`.",
          },
        };
      }
      if (result.usage) {
        return { usage: { ...result.usage, viaOmp: true }, error: result.error };
      }
    }
    return result;
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

// --- Legacy providers (Phase 2): API-key / local-CLI credential sources ---

export const useKimiUsage = createUsageHook<KimiUsage, KimiError>({
  agentId: "kimi",
  resolveAuthKey: async () => (await resolveKimiToken(prefValue("kimiCodeApiKey"))) ?? "",
  fetcher: async () => {
    const token = await resolveKimiToken(prefValue("kimiCodeApiKey"));
    if (!token) {
      return {
        usage: null,
        error: {
          type: "not_configured",
          message: "Kimi not configured. Add a Kimi Code API key in settings, set KIMI_CODE_API_KEY, or log in with the Kimi Code CLI.",
        },
      };
    }
    return fetchKimiUsage(token);
  },
});

export const useSyntheticUsage = createUsageHook<SyntheticUsage, SyntheticError>({
  agentId: "synthetic",
  resolveAuthKey: async () => (await resolveSyntheticApiKey(prefValue("syntheticApiKey"))) ?? "",
  fetcher: async () => {
    const apiKey = await resolveSyntheticApiKey(prefValue("syntheticApiKey"));
    if (!apiKey) {
      return {
        usage: null,
        error: {
          type: "not_configured",
          message: "Synthetic not configured. Create an API key at dev.synthetic.new and add it in extension settings or set SYNTHETIC_API_KEY.",
        },
      };
    }
    return fetchSyntheticUsage(apiKey);
  },
});

export const useClinepassUsage = createUsageHook<ClinepassUsage, ClinepassError>({
  agentId: "clinepass",
  resolveAuthKey: async () => (await resolveClinepassApiKey(prefValue("clinepassApiKey"))) ?? "",
  fetcher: async () => {
    const apiKey = await resolveClinepassApiKey(prefValue("clinepassApiKey"));
    if (!apiKey) {
      return {
        usage: null,
        error: {
          type: "not_configured",
          message: "ClinePass not configured. Create an API key in the Cline app and add it in extension settings or set CLINEPASS_API_KEY.",
        },
      };
    }
    return fetchClinepassUsage(apiKey);
  },
});

export const useDroidUsage = createUsageHook<DroidUsage, DroidError>({
  agentId: "droid",
  resolveAuthKey: async () => (await resolveFactoryApiKey(prefValue("droidApiKey"))) ?? "",
  fetcher: async () => {
    const apiKey = await resolveFactoryApiKey(prefValue("droidApiKey"));
    if (!apiKey) {
      return {
        usage: null,
        error: {
          type: "not_configured",
          message: "Droid (Factory) not configured. Generate a key at app.factory.ai/settings/api-keys, set FACTORY_API_KEY, or keep it in ~/.factory/.env.",
        },
      };
    }
    return fetchDroidUsage(apiKey);
  },
});

export const useMinimaxUsage = createUsageHook<MinimaxUsage, MinimaxError>({
  agentId: "minimax",
  resolveAuthKey: async () => (await resolveMinimaxApiKey(prefValue("minimaxApiKey"))) ?? "",
  fetcher: async () => {
    const apiKey = await resolveMinimaxApiKey(prefValue("minimaxApiKey"));
    if (!apiKey) {
      return {
        usage: null,
        error: {
          type: "not_configured",
          message: "MiniMax not configured. Create a Coding Plan key at platform.minimax.io and add it in extension settings or set MINIMAX_CODING_API_KEY.",
        },
      };
    }
    return fetchMinimaxUsage(apiKey, "global");
  },
});

export const useMinimaxcnUsage = createUsageHook<MinimaxUsage, MinimaxError>({
  agentId: "minimaxcn",
  resolveAuthKey: async () => (await resolveMinimaxcnApiKey(prefValue("minimaxcnApiKey"))) ?? "",
  fetcher: async () => {
    const apiKey = await resolveMinimaxcnApiKey(prefValue("minimaxcnApiKey"));
    if (!apiKey) {
      return {
        usage: null,
        error: {
          type: "not_configured",
          message: "MiniMax (China) not configured. Create a Coding Plan key at platform.minimaxi.com and add it in extension settings or set MINIMAX_CN_API_KEY.",
        },
      };
    }
    return fetchMinimaxUsage(apiKey, "cn");
  },
});

export const useGrokUsage = createUsageHook<GrokUsage, GrokError>({
  agentId: "grok",
  resolveAuthKey: async () => (await resolveGrokCredential(prefValue("grokBearerToken")))?.token ?? "",
  fetcher: async () => {
    const credential = await resolveGrokCredential(prefValue("grokBearerToken"));
    if (!credential) {
      return {
        usage: null,
        error: {
          type: "not_configured",
          message: "Grok not configured. Sign in with the Grok CLI (`grok login`), set GROK_OAUTH_TOKEN, or add a session token in extension settings.",
        },
      };
    }
    return fetchGrokUsage(credential);
  },
});

export const useAmpUsage = createUsageHook<AmpUsage, AmpError>({
  agentId: "amp",
  resolveAuthKey: async () => (await resolveAmpApiKey(prefValue("ampApiKey"))) ?? "",
  fetcher: async () => {
    const apiKey = await resolveAmpApiKey(prefValue("ampApiKey"));
    return fetchAmpUsage(apiKey);
  },
});

export const useAihubmixUsage = createUsageHook<AihubmixUsage, AihubmixError>({
  agentId: "aihubmix",
  resolveAuthKey: async () => (await resolveAihubmixApiKey(prefValue("aihubmixApiKey"))) ?? "",
  fetcher: async () => {
    const apiKey = await resolveAihubmixApiKey(prefValue("aihubmixApiKey"));
    if (!apiKey) {
      return {
        usage: null,
        error: {
          type: "not_configured",
          message: "AiHubMix not configured. Create an API key at aihubmix.com and add it in extension settings or set AIHUBMIX_API_KEY.",
        },
      };
    }
    return fetchAihubmixUsage(apiKey);
  },
});
