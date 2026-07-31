import { getPreferenceValues, List, updateCommandMetadata } from "@vicinae/api";
import { useEffect, useRef, useState } from "react";
import { ContextCollector } from "../lib/context";
import { errorMessage, showFailureToast } from "../lib/feedback";
import { createId } from "../lib/id";
import { LlmService, type LlmDisplayConfig } from "../lib/llm";
import { buildChatPrompt } from "../lib/prompt";
import { formatProvider } from "../lib/providers";
import { ShortcutRepository } from "../lib/storage";
import { trimText } from "../lib/string";
import type { ChatMessage, ContextBlock, ContextSource, LlmShortcut, Preferences, ShortcutRun } from "../lib/types";
import { CommandForm } from "./CommandForm";
import { RunDetail } from "./RunDetail";

interface ShortcutRunnerProps {
  shortcutId: string;
}

const repository = new ShortcutRepository();
const contextCollector = new ContextCollector();
const llmService = new LlmService();

/**
 * Runs a prompt from either the manager command or a Quicklink deeplink.
 */
export function ShortcutRunner({ shortcutId }: ShortcutRunnerProps) {
  const [shortcut, setShortcut] = useState<LlmShortcut>();
  const [contextBlocks, setContextBlocks] = useState<ContextBlock[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeRun, setActiveRun] = useState<ShortcutRun>();
  const [displayConfig, setDisplayConfig] = useState<LlmDisplayConfig>();
  const [error, setError] = useState("");
  const [failedCommand, setFailedCommand] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [needsCommand, setNeedsCommand] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loaded = await repository.getShortcut(shortcutId);
        if (cancelled) {
          return;
        }

        setShortcut(loaded);

        if (!loaded) {
          setIsLoading(false);
          setError("Prompt not found. It may have been deleted.");
          return;
        }

        if (!trimText(loaded.defaultCommand)) {
          const collectedContext = await contextCollector.collect(loaded.contextSources);
          if (cancelled) {
            return;
          }

          setContextBlocks(collectedContext);
          setNeedsCommand(true);
          setIsLoading(false);
          return;
        }

        setIsLoading(false);
        void executeTurn(loaded, loaded.defaultCommand);
      } catch (caught) {
        if (cancelled) {
          return;
        }

        setIsLoading(false);
        setError(caught instanceof Error ? caught.message : "Failed to load prompt.");
      }
    })();

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [shortcutId]);

  useEffect(() => {
    const subtitle = displayConfig ? `${formatProvider(displayConfig.provider)} · ${displayConfig.model}` : null;
    void updateCommandMetadata({ subtitle });

    return () => {
      void updateCommandMetadata({ subtitle: null });
    };
  }, [displayConfig]);

  async function executeTurn(
    targetShortcut: LlmShortcut,
    userCommand: string,
    existingRun = activeRun,
    initialContextBlocks?: ContextBlock[],
  ) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setNeedsCommand(false);
    setIsLoading(false);
    setIsStreaming(true);
    setError("");
    setFailedCommand("");

    try {
      const collectedContext =
        existingRun?.contextBlocks ?? initialContextBlocks ?? (await contextCollector.collect(targetShortcut.contextSources));
      if (signal.aborted) {
        return;
      }

      const priorMessages = existingRun?.messages ?? [];
      const now = new Date().toISOString();
      const userMessage: ChatMessage = {
        id: createId("message"),
        role: "user",
        content: userCommand,
        createdAt: now,
      };
      const assistantMessage: ChatMessage = {
        id: createId("message"),
        role: "assistant",
        content: "",
        createdAt: now,
      };
      const visibleMessages = [...priorMessages, userMessage, assistantMessage];

      setContextBlocks(collectedContext);
      setMessages(visibleMessages);

      const prompt = buildChatPrompt(targetShortcut, [...priorMessages, userMessage], collectedContext);
      let streamedText = "";
      const result = await llmService.stream(targetShortcut, prompt.system, prompt.messages, {
        signal,
        onStart: setDisplayConfig,
        onDelta: (delta) => {
          if (signal.aborted) {
            return;
          }

          streamedText += delta;
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessage.id ? { ...message, content: streamedText } : message,
            ),
          );
        },
      });
      if (signal.aborted) {
        return;
      }

      const finalMessages = [...priorMessages, userMessage, { ...assistantMessage, content: result.text }];
      const updatedAt = new Date().toISOString();
      const run: ShortcutRun = existingRun
        ? {
            ...existingRun,
            messages: finalMessages,
            model: result.config.model,
            provider: result.config.provider,
            closeWindowOnCopy: targetShortcut.closeWindowOnCopy ?? false,
            updatedAt,
          }
        : {
            id: createId("run"),
            shortcutId: targetShortcut.id,
            shortcutName: targetShortcut.name,
            command: userCommand,
            contextBlocks: collectedContext,
            messages: finalMessages,
            model: result.config.model,
            provider: result.config.provider,
            closeWindowOnCopy: targetShortcut.closeWindowOnCopy ?? false,
            createdAt: now,
            updatedAt,
          };

      setMessages(finalMessages);
      setActiveRun(run);
      if (getPreferenceValues<Preferences>().enableHistory !== false) {
        await repository.saveRun(run);
      }
    } catch (caught) {
      if (signal.aborted) {
        return;
      }

      setError(errorMessage(caught));
      setFailedCommand(userCommand);
      await showFailureToast("Prompt failed", caught);
    } finally {
      if (!signal.aborted) {
        setIsStreaming(false);
      }
    }
  }

  function submitInitialCommand(command: string, includedSources?: ContextSource[]) {
    if (!shortcut) {
      return;
    }

    const included =
      includedSources === undefined ? contextBlocks : contextBlocks.filter((block) => includedSources.includes(block.source));
    void executeTurn(shortcut, command, undefined, included);
  }

  function submitReply(command: string) {
    if (!shortcut || !activeRun || isStreaming) {
      return;
    }

    void executeTurn(shortcut, command, activeRun);
  }

  if (needsCommand && shortcut) {
    return (
      <CommandForm
        navigationTitle={shortcut.name}
        submitTitle="Run Prompt"
        contextBlocks={contextBlocks}
        selectableContext
        onSubmit={submitInitialCommand}
      />
    );
  }

  if (isLoading) {
    return <List isLoading searchBarPlaceholder="Loading prompt..." />;
  }

  return (
    <RunDetail
      shortcutName={shortcut?.name ?? "PromptDeck"}
      contextBlocks={contextBlocks}
      messages={messages}
      provider={displayConfig?.provider}
      model={displayConfig?.model}
      error={error}
      isStreaming={isStreaming}
      closeWindowOnCopy={shortcut?.closeWindowOnCopy ?? false}
      pasteToActiveApp={shortcut?.pasteToActiveApp ?? false}
      replyTarget={
        shortcut && activeRun ? (
          <CommandForm
            navigationTitle={shortcut.name}
            submitTitle="Send Reply"
            contextBlocks={contextBlocks}
            onSubmit={submitReply}
            includeConversationNote
            popCountOnSubmit={1}
          />
        ) : undefined
      }
      fullChatReplyTarget={
        shortcut && activeRun ? (
          <CommandForm
            navigationTitle={shortcut.name}
            submitTitle="Send Reply"
            contextBlocks={contextBlocks}
            onSubmit={submitReply}
            includeConversationNote
            popCountOnSubmit={2}
          />
        ) : undefined
      }
      retryTarget={
        shortcut && failedCommand ? (
          <CommandForm
            navigationTitle={shortcut.name}
            submitTitle={activeRun ? "Send Reply" : "Run Prompt"}
            initialCommand={failedCommand}
            contextBlocks={contextBlocks}
            selectableContext={!activeRun}
            includeConversationNote={Boolean(activeRun)}
            popCountOnSubmit={1}
            onSubmit={(command, includedSources) =>
              activeRun ? submitReply(command) : submitInitialCommand(command, includedSources)
            }
          />
        ) : undefined
      }
    />
  );
}
