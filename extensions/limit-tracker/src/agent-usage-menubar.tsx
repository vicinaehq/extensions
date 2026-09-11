import {
  getPreferenceValues,
  Icon,
  MenuBarExtra,
  open,
  openCommandPreferences,
  showHUD,
  Keyboard,
} from "@vicinae/api";
import type { Image } from "@vicinae/api";
import { useMemo } from "react";

import { formatClock, latestTimestamp } from "./agents/format.ts";
import { parsePinnedProviders, sortByDefaultAgentOrder } from "./agents/order.ts";
import {
  useAihubmixUsage,
  useAmpUsage,
  useAntigravityUsage,
  useClaudeUsage,
  useClinepassUsage,
  useCodexAccounts,
  useCommandcodeUsage,
  useCopilotUsage,
  useCursorUsage,
  useDeepSeekUsage,
  useDevinUsage,
  useDroidUsage,
  useGeminiUsage,
  useGrokUsage,
  useKimiUsage,
  useMinimaxUsage,
  useMinimaxcnUsage,
  useOpencodegoUsage,
  useSyntheticUsage,
  useZaiAccounts,
} from "./agents/provider-hooks.ts";
import type { AgentId, Accessory, AgentVisibilityPreferences, LimitView } from "./agents/types.ts";
import { getThemeIcon } from "./agents/ui.tsx";
import { getAihubmixAccessory } from "./aihubmix/renderer.tsx";
import { getAmpAccessory } from "./amp/renderer.tsx";
import { getAntigravityAccessory } from "./antigravity/renderer.tsx";
import { getClaudeAccessory } from "./claude/renderer.tsx";
import { getClinepassAccessory } from "./clinepass/renderer.tsx";
import { getCodexAccessory } from "./codex/renderer.tsx";
import { getCommandcodeAccessory } from "./commandcode/renderer.tsx";
import { getCopilotAccessory } from "./copilot/renderer.tsx";
import { getCursorAccessory } from "./cursor/renderer.tsx";
import { getDeepSeekAccessory } from "./deepseek/renderer.tsx";
import { getDevinAccessory } from "./devin/renderer.tsx";
import { getDroidAccessory } from "./droid/renderer.tsx";
import { getGeminiAccessory } from "./gemini/renderer.tsx";
import { getGrokAccessory } from "./grok/renderer.tsx";
import { getKimiAccessory } from "./kimi/renderer.tsx";
import { getMinimaxAccessory } from "./minimax/renderer.tsx";
import { getOpencodegoAccessory } from "./opencode-go/renderer.tsx";
import { getSyntheticAccessory } from "./synthetic/renderer.tsx";
import { getZaiAccessory } from "./zai/renderer.tsx";

interface MenuBarAgent {
  id: AgentId;
  name: string;
  icon: Image.ImageLike;
  visible: boolean;
  isLoading: boolean;
  accessory: Accessory;
  revalidate: () => Promise<void>;
  lastFetchedAt?: number;
  isOpenCodeActive?: boolean;
}

function getMenuItemTitle(name: string, value: string, isLoading: boolean, isOpenCodeActive?: boolean): string {
  const prefix = isOpenCodeActive ? "⚡ " : "";
  if (isLoading || !value) return `${prefix}${name}`;
  return `${prefix}${name}  ${value}`;
}

function getMenuItemTooltip(usageTooltip?: string): string {
  const actionHint = "Click to open details";
  return usageTooltip ? `${usageTooltip}\n${actionHint}` : actionHint;
}

export default function MenuBarCommand() {
  const prefs = getPreferenceValues<AgentVisibilityPreferences>();
  const pinnedIds = parsePinnedProviders(prefs.pinnedProviders);

  const isClaudeVisible = Boolean(prefs.showClaude);
  const isAntigravityVisible = Boolean(prefs.showAntigravity);
  const isCommandcodeVisible = Boolean(prefs.showCommandcode);
  const isCodexVisible = Boolean(prefs.showCodex);
  const isCopilotVisible = Boolean(prefs.showCopilot);
  const isCursorVisible = Boolean(prefs.showCursor);
  const isDeepSeekVisible = Boolean(prefs.showDeepSeek);
  const isDevinVisible = Boolean(prefs.showDevin);
  const isGeminiVisible = Boolean(prefs.showGemini);
  const isOpencodeGoVisible = Boolean(prefs.showOpencodeGo);
  const isZaiVisible = Boolean(prefs.showZai);
  const isAihubmixVisible = Boolean(prefs.showAihubmix);
  const isAmpVisible = Boolean(prefs.showAmp);
  const isClinepassVisible = Boolean(prefs.showClinePass);
  const isDroidVisible = Boolean(prefs.showDroid);
  const isGrokVisible = Boolean(prefs.showGrok);
  const isKimiVisible = Boolean(prefs.showKimi);
  const isMinimaxVisible = Boolean(prefs.showMinimax);
  const isMinimaxcnVisible = Boolean(prefs.showMinimaxCN);
  const isSyntheticVisible = Boolean(prefs.showSynthetic);

  const claudeState = useClaudeUsage(isClaudeVisible);
  const antigravityState = useAntigravityUsage(isAntigravityVisible);
  const commandcodeState = useCommandcodeUsage(isCommandcodeVisible);
  const codexState = useCodexAccounts(isCodexVisible);
  const copilotState = useCopilotUsage(isCopilotVisible);
  const cursorState = useCursorUsage(isCursorVisible);
  const deepseekState = useDeepSeekUsage(isDeepSeekVisible);
  const devinState = useDevinUsage(isDevinVisible);
  const geminiState = useGeminiUsage(isGeminiVisible);
  const opencodegoState = useOpencodegoUsage(isOpencodeGoVisible);
  const zaiState = useZaiAccounts(isZaiVisible);
  const aihubmixState = useAihubmixUsage(isAihubmixVisible);
  const ampState = useAmpUsage(isAmpVisible);
  const clinepassState = useClinepassUsage(isClinepassVisible);
  const droidState = useDroidUsage(isDroidVisible);
  const grokState = useGrokUsage(isGrokVisible);
  const kimiState = useKimiUsage(isKimiVisible);
  const minimaxState = useMinimaxUsage(isMinimaxVisible);
  const minimaxcnState = useMinimaxcnUsage(isMinimaxcnVisible);
  const syntheticState = useSyntheticUsage(isSyntheticVisible);

  const singleAgents = useMemo<MenuBarAgent[]>(
    () => [
      {
        id: "claude",
        name: "Claude",
        icon: getThemeIcon("claude-icon.svg"),
        visible: isClaudeVisible,
        isLoading: claudeState.isLoading,
        accessory: getClaudeAccessory(claudeState.usage, claudeState.error, claudeState.isLoading, (prefs.claudeLimitView ?? "auto") as LimitView),
        revalidate: claudeState.revalidate,
        lastFetchedAt: claudeState.lastFetchedAt,
      },
      {
        id: "copilot",
        name: "Copilot",
        icon: getThemeIcon("copilot-icon.svg"),
        visible: isCopilotVisible,
        isLoading: copilotState.isLoading,
        accessory: getCopilotAccessory(copilotState.usage, copilotState.error, copilotState.isLoading),
        revalidate: copilotState.revalidate,
        lastFetchedAt: copilotState.lastFetchedAt,
      },
      {
        id: "cursor",
        name: "Cursor",
        icon: getThemeIcon("cursor-icon.svg"),
        visible: isCursorVisible,
        isLoading: cursorState.isLoading,
        accessory: getCursorAccessory(cursorState.usage, cursorState.error, cursorState.isLoading),
        revalidate: cursorState.revalidate,
        lastFetchedAt: cursorState.lastFetchedAt,
      },
      {
        id: "deepseek",
        name: "DeepSeek",
        icon: getThemeIcon("deepseek.svg"),
        visible: isDeepSeekVisible,
        isLoading: deepseekState.isLoading,
        accessory: getDeepSeekAccessory(deepseekState.usage, deepseekState.error, deepseekState.isLoading),
        revalidate: deepseekState.revalidate,
        lastFetchedAt: deepseekState.lastFetchedAt,
      },
      {
        id: "devin",
        name: "Devin",
        icon: getThemeIcon("devin-icon.svg"),
        visible: isDevinVisible,
        isLoading: devinState.isLoading,
        accessory: getDevinAccessory(devinState.usage, devinState.error, devinState.isLoading),
        revalidate: devinState.revalidate,
        lastFetchedAt: devinState.lastFetchedAt,
      },
      {
        id: "gemini",
        name: "Gemini",
        icon: getThemeIcon("gemini-icon.png"),
        visible: isGeminiVisible,
        isLoading: geminiState.isLoading,
        accessory: getGeminiAccessory(geminiState.usage, geminiState.error, geminiState.isLoading),
        revalidate: geminiState.revalidate,
        lastFetchedAt: geminiState.lastFetchedAt,
      },
      {
        id: "opencode-go",
        name: "OpenCode Go",
        icon: getThemeIcon("opencode-go-icon.svg"),
        visible: isOpencodeGoVisible,
        isLoading: opencodegoState.isLoading,
        accessory: getOpencodegoAccessory(opencodegoState.usage, opencodegoState.error, opencodegoState.isLoading),
        revalidate: opencodegoState.revalidate,
        lastFetchedAt: opencodegoState.lastFetchedAt,
      },
      {
        id: "antigravity",
        name: "Antigravity",
        icon: getThemeIcon("antigravity-icon.png"),
        visible: isAntigravityVisible,
        isLoading: antigravityState.isLoading,
        accessory: getAntigravityAccessory(antigravityState.usage, antigravityState.error, antigravityState.isLoading),
        revalidate: antigravityState.revalidate,
        lastFetchedAt: antigravityState.lastFetchedAt,
      },
      {
        id: "commandcode",
        name: "Command Code",
        icon: getThemeIcon("commandcode-icon.svg"),
        visible: isCommandcodeVisible,
        isLoading: commandcodeState.isLoading,
        accessory: getCommandcodeAccessory(commandcodeState.usage, commandcodeState.error, commandcodeState.isLoading),
        revalidate: commandcodeState.revalidate,
        lastFetchedAt: commandcodeState.lastFetchedAt,
      },
      {
        id: "kimi",
        name: "Kimi",
        icon: getThemeIcon("kimi-icon.svg"),
        visible: isKimiVisible,
        isLoading: kimiState.isLoading,
        accessory: getKimiAccessory(kimiState.usage, kimiState.error, kimiState.isLoading),
        revalidate: kimiState.revalidate,
        lastFetchedAt: kimiState.lastFetchedAt,
      },
      {
        id: "synthetic",
        name: "Synthetic",
        icon: getThemeIcon("synthetic-icon.svg"),
        visible: isSyntheticVisible,
        isLoading: syntheticState.isLoading,
        accessory: getSyntheticAccessory(syntheticState.usage, syntheticState.error, syntheticState.isLoading),
        revalidate: syntheticState.revalidate,
        lastFetchedAt: syntheticState.lastFetchedAt,
      },
      {
        id: "clinepass",
        name: "ClinePass",
        icon: getThemeIcon("clinepass-icon.svg"),
        visible: isClinepassVisible,
        isLoading: clinepassState.isLoading,
        accessory: getClinepassAccessory(clinepassState.usage, clinepassState.error, clinepassState.isLoading),
        revalidate: clinepassState.revalidate,
        lastFetchedAt: clinepassState.lastFetchedAt,
      },
      {
        id: "droid",
        name: "Droid",
        icon: getThemeIcon("droid-icon.svg"),
        visible: isDroidVisible,
        isLoading: droidState.isLoading,
        accessory: getDroidAccessory(droidState.usage, droidState.error, droidState.isLoading),
        revalidate: droidState.revalidate,
        lastFetchedAt: droidState.lastFetchedAt,
      },
      {
        id: "minimax",
        name: "MiniMax",
        icon: getThemeIcon("minimax-icon.svg"),
        visible: isMinimaxVisible,
        isLoading: minimaxState.isLoading,
        accessory: getMinimaxAccessory("MiniMax", minimaxState.usage, minimaxState.error, minimaxState.isLoading),
        revalidate: minimaxState.revalidate,
        lastFetchedAt: minimaxState.lastFetchedAt,
      },
      {
        id: "minimaxcn",
        name: "MiniMax CN",
        icon: getThemeIcon("minimax-icon.svg"),
        visible: isMinimaxcnVisible,
        isLoading: minimaxcnState.isLoading,
        accessory: getMinimaxAccessory("MiniMax CN", minimaxcnState.usage, minimaxcnState.error, minimaxcnState.isLoading),
        revalidate: minimaxcnState.revalidate,
        lastFetchedAt: minimaxcnState.lastFetchedAt,
      },
      {
        id: "grok",
        name: "Grok",
        icon: getThemeIcon("grok-icon.svg"),
        visible: isGrokVisible,
        isLoading: grokState.isLoading,
        accessory: getGrokAccessory(grokState.usage, grokState.error, grokState.isLoading),
        revalidate: grokState.revalidate,
        lastFetchedAt: grokState.lastFetchedAt,
      },
      {
        id: "amp",
        name: "Amp",
        icon: getThemeIcon("amp-icon.svg"),
        visible: isAmpVisible,
        isLoading: ampState.isLoading,
        accessory: getAmpAccessory(ampState.usage, ampState.error, ampState.isLoading),
        revalidate: ampState.revalidate,
        lastFetchedAt: ampState.lastFetchedAt,
      },
      {
        id: "aihubmix",
        name: "AiHubMix",
        icon: getThemeIcon("aihubmix-icon.svg"),
        visible: isAihubmixVisible,
        isLoading: aihubmixState.isLoading,
        accessory: getAihubmixAccessory(aihubmixState.usage, aihubmixState.error, aihubmixState.isLoading),
        revalidate: aihubmixState.revalidate,
        lastFetchedAt: aihubmixState.lastFetchedAt,
      },
    ],
    [
      isClaudeVisible,
      isAntigravityVisible,
      isCommandcodeVisible,
      isCopilotVisible,
      isCursorVisible,
      isDeepSeekVisible,
      isDevinVisible,
      isGeminiVisible,
      isOpencodeGoVisible,
      antigravityState.isLoading,
      antigravityState.usage,
      antigravityState.error,
      antigravityState.revalidate,
      antigravityState.lastFetchedAt,
      claudeState.isLoading,
      claudeState.usage,
      claudeState.error,
      claudeState.revalidate,
      claudeState.lastFetchedAt,
      copilotState.isLoading,
      copilotState.usage,
      copilotState.error,
      copilotState.revalidate,
      copilotState.lastFetchedAt,
      cursorState.isLoading,
      cursorState.usage,
      cursorState.error,
      cursorState.revalidate,
      cursorState.lastFetchedAt,
      deepseekState.isLoading,
      deepseekState.usage,
      deepseekState.error,
      deepseekState.revalidate,
      deepseekState.lastFetchedAt,
      devinState.isLoading,
      devinState.usage,
      devinState.error,
      devinState.revalidate,
      devinState.lastFetchedAt,
      geminiState.isLoading,
      geminiState.usage,
      geminiState.error,
      geminiState.revalidate,
      geminiState.lastFetchedAt,
      commandcodeState.isLoading,
      commandcodeState.usage,
      commandcodeState.error,
      commandcodeState.revalidate,
      commandcodeState.lastFetchedAt,
      isKimiVisible,
      isSyntheticVisible,
      isClinepassVisible,
      isDroidVisible,
      isMinimaxVisible,
      isMinimaxcnVisible,
      isGrokVisible,
      isAmpVisible,
      isAihubmixVisible,
      kimiState.isLoading,
      kimiState.usage,
      kimiState.error,
      kimiState.revalidate,
      kimiState.lastFetchedAt,
      syntheticState.isLoading,
      syntheticState.usage,
      syntheticState.error,
      syntheticState.revalidate,
      syntheticState.lastFetchedAt,
      clinepassState.isLoading,
      clinepassState.usage,
      clinepassState.error,
      clinepassState.revalidate,
      clinepassState.lastFetchedAt,
      droidState.isLoading,
      droidState.usage,
      droidState.error,
      droidState.revalidate,
      droidState.lastFetchedAt,
      minimaxState.isLoading,
      minimaxState.usage,
      minimaxState.error,
      minimaxState.revalidate,
      minimaxState.lastFetchedAt,
      minimaxcnState.isLoading,
      minimaxcnState.usage,
      minimaxcnState.error,
      minimaxcnState.revalidate,
      minimaxcnState.lastFetchedAt,
      grokState.isLoading,
      grokState.usage,
      grokState.error,
      grokState.revalidate,
      grokState.lastFetchedAt,
      ampState.isLoading,
      ampState.usage,
      ampState.error,
      ampState.revalidate,
      ampState.lastFetchedAt,
      aihubmixState.isLoading,
      aihubmixState.usage,
      aihubmixState.error,
      aihubmixState.revalidate,
      aihubmixState.lastFetchedAt,
    ],
  );

  const codexAgents = useMemo<MenuBarAgent[]>(() => {
    if (!isCodexVisible) return [];
    if (codexState.isLoading) {
      return [
        {
          id: "codex" as AgentId,
          name: "Codex",
          icon: getThemeIcon("codex-icon.svg"),
          visible: true,
          isLoading: true,
          accessory: getCodexAccessory(null, null, true, (prefs.codexLimitView ?? "auto") as LimitView),
          revalidate: codexState.revalidate,
        },
      ];
    }
    return codexState.accounts.map((account) => ({
      id: `codex-${account.accountId}` as AgentId,
      name:
        account.usage?.displayName || account.label !== "Default"
          ? `Codex • ${account.usage?.displayName || account.label}`
          : "Codex",
      icon: getThemeIcon("codex-icon.svg"),
      visible: true,
      isLoading: account.isLoading,
      accessory: getCodexAccessory(account.usage, account.error, account.isLoading, (prefs.codexLimitView ?? "auto") as LimitView),
      revalidate: account.revalidate,
      isOpenCodeActive: account.isOpenCodeActive,
      lastFetchedAt: account.lastFetchedAt,
    }));
  }, [isCodexVisible, codexState, prefs.codexLimitView]);

  const zaiAgents = useMemo<MenuBarAgent[]>(() => {
    if (!isZaiVisible) return [];
    if (zaiState.isLoading) {
      return [
        {
          id: "zai" as AgentId,
          name: "z.ai",
          icon: getThemeIcon("zai-icon.svg"),
          visible: true,
          isLoading: true,
          accessory: getZaiAccessory(null, null, true),
          revalidate: zaiState.revalidate,
        },
      ];
    }
    return zaiState.accounts.map((account) => ({
      id: `zai-${account.accountId}` as AgentId,
      name: account.label === "Default" ? "z.ai" : `z.ai • ${account.label}`,
      icon: getThemeIcon("zai-icon.svg"),
      visible: true,
      isLoading: account.isLoading,
      accessory: getZaiAccessory(account.usage, account.error, account.isLoading),
      revalidate: account.revalidate,
      isOpenCodeActive: account.isOpenCodeActive,
      lastFetchedAt: account.lastFetchedAt,
    }));
  }, [isZaiVisible, zaiState]);

  const visibleAgents = useMemo(
    () =>
      sortByDefaultAgentOrder(
        [...singleAgents, ...codexAgents, ...zaiAgents].filter((a) => a.visible),
      ),
    [singleAgents, codexAgents, zaiAgents],
  );

  const isLoading = visibleAgents.some((agent) => agent.isLoading);

  const handleRefresh = async () => {
    await Promise.all(visibleAgents.map((a) => a.revalidate()));
    await showHUD("Agent Usage Refreshed");
  };

  const latestFetchedAt = latestTimestamp(visibleAgents.map((agent) => agent.lastFetchedAt));
  const updatedAt = !isLoading && latestFetchedAt ? formatClock(latestFetchedAt) : "—";
  const refreshTitle = `Refresh All (Updated ${updatedAt})`;

  return (
    <MenuBarExtra icon={getThemeIcon("limit-tracker-icon.svg")} isLoading={isLoading} tooltip="Agent Usage">
      <MenuBarExtra.Section>
        {visibleAgents.map((agent) => (
          <MenuBarExtra.Item
            key={agent.id}
            icon={agent.icon}
            title={getMenuItemTitle(agent.name, agent.accessory.text, agent.isLoading, agent.isOpenCodeActive)}
            tooltip={getMenuItemTooltip(agent.accessory.tooltip)}
            onAction={() => open("vicinae://launch/limit-tracker/agent-usage")}
          />
        ))}
      </MenuBarExtra.Section>
      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          title={refreshTitle}
          icon={Icon.ArrowClockwise}
          shortcut={{ modifiers: ["cmd"], key: "c" }}
          onAction={handleRefresh}
        />
        <MenuBarExtra.Item
          title="Open Agent Usage"
          icon={Icon.AppWindowList}
          shortcut={{ modifiers: ["cmd"], key: "o" }}
          onAction={() => open("vicinae://launch/limit-tracker/agent-usage")}
        />
        <MenuBarExtra.Item title="Configure Command" icon={Icon.Cog} onAction={openCommandPreferences} />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
