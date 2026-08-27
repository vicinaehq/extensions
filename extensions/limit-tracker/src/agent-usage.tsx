import {
  Action,
  ActionPanel,
  Color,
  getPreferenceValues,
  Icon,
  List,
  LocalStorage,
  openExtensionPreferences,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import type { LaunchProps } from "@vicinae/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ManageAccountsForm } from "./accounts/ManageAccountsForm.tsx";
import type { AccountUsageState } from "./accounts/types.ts";
import { formatErrorMarkdown } from "./agents/detail-format.ts";
import { formatClock, latestTimestamp } from "./agents/format.ts";
import {
  useClaudeUsage,
  useCodexAccounts,
  useCopilotUsage,
  useCursorUsage,
  useDeepSeekUsage,
  useGeminiUsage,
  useOpencodegoUsage,
  useZaiAccounts,
} from "./agents/provider-hooks.ts";
import type { Accessory, AgentDefinition, AgentVisibilityPreferences, LimitView, UsageState } from "./agents/types.ts";
import { getListIcon } from "./agents/ui.tsx";
import { formatClaudeUsageText, getClaudeAccessory, renderClaudeDetail } from "./claude/renderer.tsx";
import type { ClaudeError, ClaudeUsage } from "./claude/types.ts";
import { formatCodexUsageText, getCodexAccessory, renderCodexDetail } from "./codex/renderer.tsx";
import type { CodexError, CodexUsage } from "./codex/types.ts";
import { formatCopilotUsageText, getCopilotAccessory, renderCopilotDetail } from "./copilot/renderer.tsx";
import type { CopilotError, CopilotUsage } from "./copilot/types.ts";
import { formatCursorUsageText, getCursorAccessory, renderCursorDetail } from "./cursor/renderer.tsx";
import type { CursorError, CursorUsage } from "./cursor/types.ts";
import { formatDeepSeekUsageText, getDeepSeekAccessory, renderDeepSeekDetail } from "./deepseek/renderer.tsx";
import type { DeepSeekError, DeepSeekUsage } from "./deepseek/types.ts";
import { formatGeminiUsageText, getGeminiAccessory, renderGeminiDetail } from "./gemini/renderer.tsx";
import type { GeminiError, GeminiUsage } from "./gemini/types.ts";
import { formatOpencodegoUsageText, getOpencodegoAccessory, renderOpencodegoDetail } from "./opencode-go/renderer.tsx";
import type { OpencodegoError, OpencodegoUsage } from "./opencode-go/types.ts";
import { formatZaiUsageText, getZaiAccessory, renderZaiDetail } from "./zai/renderer.tsx";
import type { ZaiError, ZaiUsage } from "./zai/types.ts";

const AGENT_ORDER_KEY = "agent-order";

type ErrorLike = { type: string; message: string };
type CommandLaunchContext = { selectedAgentId?: string };

interface AgentRegistryEntry<TUsage, TError extends ErrorLike> extends Omit<AgentDefinition, "id"> {
  id: CoreAgentId;
  useUsage: (enabled?: boolean) => UsageState<TUsage, TError>;
  renderDetail: (usage: TUsage | null, error: TError | null) => React.ReactNode;
  getAccessory: (usage: TUsage | null, error: TError | null, isLoading: boolean) => Accessory;
  formatUsageText: (usage: TUsage | null, error: TError | null) => string;
}

type CoreAgentId = "claude" | "codex" | "copilot" | "cursor" | "deepseek" | "gemini" | "opencode-go" | "zai";

const CORE_AGENT_ORDER: CoreAgentId[] = ["claude", "copilot", "cursor", "deepseek", "gemini", "opencode-go", "codex", "zai"];

type MultiAccountAgentId = "codex" | "zai";

interface AgentUsageById {
  claude: ClaudeUsage;
  codex: CodexUsage;
  copilot: CopilotUsage;
  cursor: CursorUsage;
  deepseek: DeepSeekUsage;
  gemini: GeminiUsage;
  "opencode-go": OpencodegoUsage;
  zai: ZaiUsage;
}

interface AgentErrorById {
  claude: ClaudeError;
  codex: CodexError;
  copilot: CopilotError;
  cursor: CursorError;
  deepseek: DeepSeekError;
  gemini: GeminiError;
  "opencode-go": OpencodegoError;
  zai: ZaiError;
}

type AgentRegistry = {
  [K in CoreAgentId]: K extends MultiAccountAgentId
    ? Omit<AgentRegistryEntry<AgentUsageById[K], AgentErrorById[K]>, "useUsage">
    : AgentRegistryEntry<AgentUsageById[K], AgentErrorById[K]>;
};

interface AgentView extends Omit<AgentDefinition, "id"> {
  id: CoreAgentId;
  error: ErrorLike | null;
  isVisible: boolean;
  isLoading: boolean;
  revalidate: () => Promise<void>;
  getAccessory: () => Accessory;
  renderDetail: () => React.ReactNode;
  formatUsageText: () => string;
  lastFetchedAt?: number;
}

interface AccountedAgentView {
  rowId: string;
  agentId: CoreAgentId;
  title: string;
  icon: string;
  settingsUrl?: string;
  error: ErrorLike | null;
  isVisible: boolean;
  isLoading: boolean;
  revalidate: () => Promise<void>;
  getAccessory: () => Accessory;
  renderDetail: () => React.ReactNode;
  formatUsageText: () => string;
  accountId: string;
  provider: "codex" | "zai";
  isSupported: boolean;
  token: string;
  isOpenCodeActive?: boolean;
  lastFetchedAt?: number;
}

const AGENT_REGISTRY: AgentRegistry = {
  claude: {
    id: "claude",
    name: "Claude",
    icon: "claude-icon.svg",
    description: "Anthropic Claude Code",
    isSupported: true,
    settingsUrl: "https://claude.ai/settings/billing",
    useUsage: useClaudeUsage,
    renderDetail: renderClaudeDetail,
    getAccessory: getClaudeAccessory,
    formatUsageText: formatClaudeUsageText,
  },
  codex: {
    id: "codex",
    name: "Codex",
    icon: "codex-icon.svg",
    description: "OpenAI Codex CLI",
    isSupported: true,
    settingsUrl: "https://chatgpt.com/codex/settings/usage",
    renderDetail: renderCodexDetail,
    getAccessory: getCodexAccessory,
    formatUsageText: formatCodexUsageText,
  },
  copilot: {
    id: "copilot",
    name: "Copilot",
    icon: "copilot-icon.svg",
    description: "GitHub Copilot",
    isSupported: true,
    settingsUrl: "https://github.com/settings/copilot",
    useUsage: useCopilotUsage,
    renderDetail: renderCopilotDetail,
    getAccessory: getCopilotAccessory,
    formatUsageText: formatCopilotUsageText,
  },
  cursor: {
    id: "cursor",
    name: "Cursor",
    icon: "cursor-icon.svg",
    description: "Cursor AI Code Editor",
    isSupported: true,
    settingsUrl: "https://cursor.com/dashboard?tab=usage",
    useUsage: useCursorUsage,
    renderDetail: renderCursorDetail,
    getAccessory: getCursorAccessory,
    formatUsageText: formatCursorUsageText,
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    icon: "deepseek.svg",
    description: "DeepSeek API Balance",
    isSupported: true,
    settingsUrl: "https://platform.deepseek.com/usage",
    useUsage: useDeepSeekUsage,
    renderDetail: renderDeepSeekDetail,
    getAccessory: getDeepSeekAccessory,
    formatUsageText: formatDeepSeekUsageText,
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    icon: "gemini-icon.png",
    description: "Google Gemini CLI",
    isSupported: true,
    useUsage: useGeminiUsage,
    renderDetail: renderGeminiDetail,
    getAccessory: getGeminiAccessory,
    formatUsageText: formatGeminiUsageText,
  },
  "opencode-go": {
    id: "opencode-go",
    name: "OpenCode Go",
    icon: "opencode-go-icon.svg",
    description: "OpenCode Go Subscription",
    isSupported: true,
    settingsUrl: "https://opencode.ai",
    useUsage: useOpencodegoUsage,
    renderDetail: renderOpencodegoDetail,
    getAccessory: getOpencodegoAccessory,
    formatUsageText: formatOpencodegoUsageText,
  },
  zai: {
    id: "zai",
    name: "z.ai",
    icon: "zai-icon.svg",
    description: "Z.AI / GLM Coding Assistant",
    isSupported: true,
    settingsUrl: "https://z.ai",
    renderDetail: renderZaiDetail,
    getAccessory: getZaiAccessory,
    formatUsageText: formatZaiUsageText,
  },
};

const AGENT_IDS: CoreAgentId[] = [...CORE_AGENT_ORDER];

function isAgentId(value: string): value is CoreAgentId {
  return value in AGENT_REGISTRY;
}

function createAgentView<TUsage, TError extends ErrorLike>(
  config: AgentRegistryEntry<TUsage, TError>,
  state: UsageState<TUsage, TError>,
  isVisible: boolean,
): AgentView {
  return {
    id: config.id,
    name: config.name,
    icon: config.icon,
    description: config.description,
    isSupported: config.isSupported,
    settingsUrl: config.settingsUrl,
    error: state.error,
    isVisible,
    isLoading: state.isLoading,
    lastFetchedAt: state.lastFetchedAt,
    revalidate: state.revalidate,
    getAccessory: () => config.getAccessory(state.usage, state.error, state.isLoading),
    renderDetail: () => config.renderDetail(state.usage, state.error),
    formatUsageText: () => config.formatUsageText(state.usage, state.error),
  };
}

function createAccountedViews<TUsage, TError extends { type: string; message: string }>(
  agentId: CoreAgentId,
  providerName: string,
  icon: string,
  settingsUrl: string | undefined,
  provider: "codex" | "zai",
  isVisible: boolean,
  accountStates: AccountUsageState<TUsage, TError>[],
  renderDetail: (usage: TUsage | null, error: TError | null) => React.ReactNode,
  getAccessory: (usage: TUsage | null, error: TError | null, isLoading: boolean) => Accessory,
  formatUsageText: (usage: TUsage | null, error: TError | null) => string,
): AccountedAgentView[] {
  return accountStates.map((state) => ({
    rowId: `${agentId}-${state.accountId}`,
    agentId,
    title: state.label === "Default" ? providerName : `${providerName} • ${state.label}`,
    icon,
    settingsUrl,
    error: state.error,
    isVisible,
    isLoading: state.isLoading,
    lastFetchedAt: state.lastFetchedAt,
    revalidate: state.revalidate,
    getAccessory: () => getAccessory(state.usage, state.error, state.isLoading),
    renderDetail: () => renderDetail(state.usage, state.error),
    formatUsageText: () => formatUsageText(state.usage, state.error),
    accountId: state.accountId,
    provider,
    isSupported: true,
    token: state.token,
    isOpenCodeActive: state.isOpenCodeActive,
  }));
}

function getAccountedTitle(providerName: string, label: string): string {
  if (label === "Default") return providerName;
  return `${providerName} • ${label}`;
}

/**
 * Short list-row subtitle (single line). Keeps the list clean like Raycast:
 * the agent name is the title, the progress ring (accessory) shows the %, and
 * the full plan/limits/reset breakdown lives in the right-hand Detail panel.
 * Only surface errors here; everything else stays empty so rows don't crowd.
 */
function listSubtitle(error: ErrorLike | null, isLoading: boolean): string {
  if (isLoading) return "";
  if (error) {
    if (error.type === "not_configured") return "Not Configured";
    if (error.type === "unauthorized") return "Token Expired";
    if (error.type === "missing_scope") return "Missing Scope";
    if (error.type === "network_error") return "Network Error";
    return "Error";
  }
  return "";
}

export default function Command(props: LaunchProps<{ launchContext: CommandLaunchContext }>) {
  const prefs = getPreferenceValues<AgentVisibilityPreferences>();
  const { push } = useNavigation();

  const refreshingRef = useRef<Set<string>>(new Set());
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const lastGlobalRefreshRef = useRef(0);
  const GLOBAL_COOLDOWN_MS = 10_000;

  const handleRefresh = useCallback(async (id: string, revalidate: () => Promise<void>) => {
    if (refreshingRef.current.has(id)) return;
    refreshingRef.current.add(id);
    setRefreshingIds((prev) => new Set(prev).add(id));
    try {
      await revalidate();
    } finally {
      refreshingRef.current.delete(id);
      setRefreshingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const claudeState = AGENT_REGISTRY.claude.useUsage(Boolean(prefs.showClaude));
  const copilotState = AGENT_REGISTRY.copilot.useUsage(Boolean(prefs.showCopilot));
  const cursorState = AGENT_REGISTRY.cursor.useUsage(Boolean(prefs.showCursor));
  const deepseekState = AGENT_REGISTRY.deepseek.useUsage(Boolean(prefs.showDeepSeek));
  const geminiState = AGENT_REGISTRY.gemini.useUsage(Boolean(prefs.showGemini));
  const opencodegoState = AGENT_REGISTRY["opencode-go"].useUsage(Boolean(prefs.showOpencodeGo));

  const codexState = useCodexAccounts(Boolean(prefs.showCodex));
  const zaiState = useZaiAccounts(Boolean(prefs.showZai));

  const agentViews: Omit<Record<CoreAgentId, AgentView>, MultiAccountAgentId> = {
    claude: {
      ...createAgentView(AGENT_REGISTRY.claude, claudeState, Boolean(prefs.showClaude)),
      getAccessory: () =>
        getClaudeAccessory(
          claudeState.usage,
          claudeState.error,
          claudeState.isLoading,
          (prefs.claudeLimitView ?? "auto") as LimitView,
        ),
    },
    copilot: createAgentView(AGENT_REGISTRY.copilot, copilotState, Boolean(prefs.showCopilot)),
    cursor: createAgentView(AGENT_REGISTRY.cursor, cursorState, Boolean(prefs.showCursor)),
    deepseek: createAgentView(AGENT_REGISTRY.deepseek, deepseekState, Boolean(prefs.showDeepSeek)),
    gemini: createAgentView(AGENT_REGISTRY.gemini, geminiState, Boolean(prefs.showGemini)),
    "opencode-go": createAgentView(
      AGENT_REGISTRY["opencode-go"],
      opencodegoState,
      Boolean(prefs.showOpencodeGo),
    ),
  };

  const claudeLimitView = (prefs.claudeLimitView ?? "auto") as LimitView;
  const codexLimitView = (prefs.codexLimitView ?? "auto") as LimitView;

  const codexAccountedViews = createAccountedViews(
    "codex",
    "Codex",
    AGENT_REGISTRY.codex.icon,
    AGENT_REGISTRY.codex.settingsUrl,
    "codex",
    Boolean(prefs.showCodex),
    codexState.accounts.map((state) =>
      state.usage?.displayName ? { ...state, label: state.usage.displayName } : state,
    ),
    renderCodexDetail,
    (usage, error, isLoading) => getCodexAccessory(usage, error, isLoading, codexLimitView),
    formatCodexUsageText,
  );

  const zaiAccountedViews = createAccountedViews(
    "zai",
    "z.ai",
    AGENT_REGISTRY.zai.icon,
    AGENT_REGISTRY.zai.settingsUrl,
    "zai",
    Boolean(prefs.showZai),
    zaiState.accounts,
    renderZaiDetail,
    getZaiAccessory,
    formatZaiUsageText,
  );

  const [agentOrder, setAgentOrder] = useState<CoreAgentId[]>(() => [...CORE_AGENT_ORDER]);
  const [orderLoaded, setOrderLoaded] = useState(false);

  useEffect(() => {
    LocalStorage.getItem<string>(AGENT_ORDER_KEY).then((stored) => {
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            const validOrder = parsed.filter(
              (id): id is CoreAgentId => typeof id === "string" && isAgentId(id),
            );
            if (validOrder.length > 0) {
              const missingIds = AGENT_IDS.filter((id) => !validOrder.includes(id));
              setAgentOrder([...validOrder, ...missingIds]);
            }
          }
        } catch {
          // keep default order
        }
      }
      setOrderLoaded(true);
    });
  }, []);

  const saveOrder = useCallback(async (newOrder: CoreAgentId[]) => {
    setAgentOrder(newOrder);
    await LocalStorage.setItem(AGENT_ORDER_KEY, JSON.stringify(newOrder));
  }, []);

  const resetAgentOrder = useCallback(async () => {
    await LocalStorage.removeItem(AGENT_ORDER_KEY);
    setAgentOrder([...CORE_AGENT_ORDER]);
    await showToast({
      title: "Agent Order Reset",
      message: "Restored the default alphabetical order.",
      style: Toast.Style.Success,
    });
  }, []);

  type ListRow = { kind: "agent"; view: AgentView } | { kind: "accounted"; view: AccountedAgentView };

  const pinnedIds = useMemo(() => {
    const pinned = prefs.pinnedProviders;
    if (!pinned) return [];
    return pinned
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((id): id is CoreAgentId => {
        const valid: CoreAgentId[] = [
          "claude",
          "codex",
          "copilot",
          "cursor",
          "deepseek",
          "gemini",
          "opencode-go",
          "zai",
        ];
        return valid.includes(id as CoreAgentId);
      })
      .slice(0, 3);
  }, [prefs.pinnedProviders]);

  const allRows = useMemo<ListRow[]>(
    () =>
      agentOrder.flatMap((agentId): ListRow[] => {
        if (agentId === "codex") {
          return codexAccountedViews.filter((v) => v.isVisible).map((view) => ({ kind: "accounted", view }));
        }
        if (agentId === "zai") {
          return zaiAccountedViews.filter((v) => v.isVisible).map((view) => ({ kind: "accounted", view }));
        }
        if (agentId in agentViews) {
          const view = agentViews[agentId as keyof typeof agentViews];
          if (!view.isVisible) return [];
          return [{ kind: "agent", view }];
        }
        return [];
      }),
    [agentOrder, codexAccountedViews, zaiAccountedViews, agentViews],
  );

  const baseRows = useMemo(() => {
    if (pinnedIds.length === 0) return allRows;
    const pinned = pinnedIds
      .map((id) =>
        allRows.find((row) => (row.kind === "agent" ? row.view.id === id : row.view.agentId === id)),
      )
      .filter((row): row is ListRow => row != null);
    const rest = allRows.filter((row) =>
      row.kind === "agent" ? !pinnedIds.includes(row.view.id) : !pinnedIds.includes(row.view.agentId),
    );
    return [...pinned, ...rest];
  }, [allRows, pinnedIds]);

  const isLoading = baseRows.some((row) =>
    row.kind === "agent" ? row.view.isLoading : row.view.isLoading,
  );
  const latestFetchedAt = latestTimestamp(
    baseRows.map((row) => (row.kind === "agent" ? row.view.lastFetchedAt : row.view.lastFetchedAt)),
  );
  const updatedAt = !isLoading && latestFetchedAt ? formatClock(latestFetchedAt) : "";

  const handleRefreshAll = useCallback(async () => {
    const now = Date.now();
    if (now - lastGlobalRefreshRef.current < GLOBAL_COOLDOWN_MS) {
      const waitSec = Math.ceil((GLOBAL_COOLDOWN_MS - (now - lastGlobalRefreshRef.current)) / 1000);
      await showToast({
        title: "Please wait",
        message: `Refresh available in ${waitSec}s`,
        style: Toast.Style.Animated,
      });
      return;
    }
    lastGlobalRefreshRef.current = now;

    const seenRevalidates = new Set<() => Promise<void>>();
    for (const row of baseRows) {
      const revalidate = row.view.revalidate;
      if (seenRevalidates.has(revalidate)) continue;
      seenRevalidates.add(revalidate);
      const id = row.kind === "agent" ? row.view.id : row.view.agentId;
      if (refreshingRef.current.has(id)) continue;
      await handleRefresh(id, revalidate);
      await new Promise((r) => setTimeout(r, 1500));
    }
    await showToast({ title: "Refreshed", message: "All agents updated.", style: Toast.Style.Success });
  }, [baseRows]);

  if (!orderLoaded) {
    return <List isLoading />;
  }

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={true}
      searchBarPlaceholder="Search agents..."
      actions={
        <ActionPanel>
          <Action
            title="Refresh All"
            icon={Icon.ArrowClockwise}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={handleRefreshAll}
          />
          <Action
            title="Reset Agent Order"
            icon={Icon.RotateAntiClockwise}
            onAction={resetAgentOrder}
          />
          <Action
            title="Open Extension Preferences"
            icon={Icon.Gear}
            shortcut={{ modifiers: ["cmd"], key: "," }}
            onAction={() => openExtensionPreferences()}
          />
        </ActionPanel>
      }
    >
      {baseRows.map((row) => {
        if (row.kind === "agent") {
          const view = row.view;
          const accessory = view.getAccessory();
          const detail = (
            <List.Item.Detail
              markdown={view.error ? formatErrorMarkdown(view.error.message) : undefined}
              metadata={view.error ? undefined : view.renderDetail()}
            />
          );
          return (
            <List.Item
              key={view.id}
              id={view.id}
              title={view.name}
              subtitle={listSubtitle(view.error, view.isLoading)}
              icon={getListIcon(view.icon)}
              accessories={[{ text: accessory.text, tooltip: accessory.tooltip, icon: accessory.icon }]}
              detail={detail}
              actions={
                <ActionPanel>
                  <Action
                    title={refreshingIds.size > 0 ? "Refreshing..." : "Refresh"}
                    icon={Icon.ArrowClockwise}
                    shortcut={{ modifiers: ["cmd"], key: "r" }}
                    onAction={handleRefreshAll}
                  />
                  {view.settingsUrl ? (
                    <Action.OpenInBrowser title="Open Settings" url={view.settingsUrl} />
                  ) : null}
                  <Action.CopyToClipboard title="Copy Usage" content={`${view.name}\n${view.formatUsageText()}`} />
                </ActionPanel>
              }
            />
          );
        }
        const view = row.view;
        const accessory = view.getAccessory();
        return (
          <List.Item
            key={view.rowId}
            id={view.rowId}
            title={view.title}
            subtitle={listSubtitle(view.error, view.isLoading)}
            icon={getListIcon(view.icon)}
            accessories={[{ text: accessory.text, tooltip: accessory.tooltip, icon: accessory.icon }]}
            detail={
              <List.Item.Detail
                markdown={view.error ? formatErrorMarkdown(view.error.message) : undefined}
                metadata={view.error ? undefined : view.renderDetail()}
              />
            }
            actions={
              <ActionPanel>
                <Action
                  title={refreshingIds.size > 0 ? "Refreshing..." : "Refresh"}
                  icon={Icon.ArrowClockwise}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                  onAction={handleRefreshAll}
                />
                {view.settingsUrl ? (
                  <Action.OpenInBrowser title="Open Settings" url={view.settingsUrl} />
                ) : null}
                <Action.CopyToClipboard title="Copy Usage" content={`${view.title}\n${view.formatUsageText()}`} />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
