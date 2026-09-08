import type {
  Options,
  SDKResultMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import {
  DEFAULT_SYSTEM_PROMPT,
  MAX_TEXT_LENGTH,
  type ModelInfo,
  type RunRequest,
} from "../core/types";
import { cleanEnvironment, inTemporaryDirectory } from "./process";

let sdkLocation = "@anthropic-ai/claude-agent-sdk";

export function completedClaudeResult(message: SDKResultMessage): string {
  if (message.subtype !== "success" || message.is_error) {
    throw new Error(
      "errors" in message
        ? message.errors.join("\n")
        : "Claude did not complete the transformation.",
    );
  }
  // Some CLI versions report success-tagged API failures or interruptions.
  // Never enable replacement for a truncated or unsuccessfully terminated turn.
  if (
    (message.terminal_reason && message.terminal_reason !== "completed") ||
    (message.api_error_status != null && message.api_error_status >= 400) ||
    (message.stop_reason &&
      !["end_turn", "stop_sequence"].includes(message.stop_reason))
  ) {
    throw new Error(
      `Claude did not finish the answer (${message.terminal_reason ?? message.api_error_status ?? message.stop_reason}). Try again.`,
    );
  }
  return message.result;
}
export function setClaudeSdkLocation(location: string): void {
  sdkLocation = location;
}
async function loadSdk(): Promise<
  typeof import("@anthropic-ai/claude-agent-sdk")
> {
  // Vicinae bundles entrypoints as CommonJS. Load the unchanged ESM SDK as an
  // asset so its import.meta.url and createRequire keep their native semantics.
  return import(sdkLocation);
}

function options(
  executable: string,
  cwd: string,
  controller: AbortController,
): Options {
  return {
    pathToClaudeCodeExecutable: executable,
    cwd,
    env: {
      ...cleanEnvironment(),
      ENABLE_CLAUDEAI_MCP_SERVERS: "false",
      CLAUDE_CODE_AUTO_CONNECT_IDE: "0",
      CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL: "1",
    },
    abortController: controller,
    tools: [],
    mcpServers: {},
    strictMcpConfig: true,
    settingSources: [],
    settings: { disableAllHooks: true },
    persistSession: false,
    permissionMode: "dontAsk",
    maxTurns: 1,
    extraArgs: {
      "safe-mode": null,
      "disable-slash-commands": null,
      "no-chrome": null,
    },
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    stderr: () => {},
  };
}

export async function claudeModels(
  executable: string,
  signal?: AbortSignal,
): Promise<ModelInfo[]> {
  const { query } = await loadSdk();
  return inTemporaryDirectory(async (cwd) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.throwIfAborted();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 25_000);
    let release!: () => void;
    const done = new Promise<void>((resolve) => {
      release = resolve;
    });
    async function* emptyInput(): AsyncGenerator<SDKUserMessage> {
      await done;
    }
    const session = query({
      prompt: emptyInput(),
      options: options(executable, cwd, controller),
    });
    try {
      const models = await session.supportedModels();
      return models.map((model) => ({
        id: model.value,
        name: model.displayName,
        description: model.description,
        efforts: model.supportedEffortLevels ?? [],
      }));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      release();
      session.close();
    }
  });
}

export async function runClaude(request: RunRequest): Promise<string> {
  const { query } = await loadSdk();
  return inTemporaryDirectory(async (cwd) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.throwIfAborted();
    request.signal.addEventListener("abort", abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 180_000);
    const session = query({
      prompt: request.prompt,
      options: {
        ...options(request.executable, cwd, controller),
        model: request.command.model,
        systemPrompt: request.command.systemPrompt || DEFAULT_SYSTEM_PROMPT,
        ...(request.command.effort
          ? { effort: request.command.effort as Options["effort"] }
          : {}),
        includePartialMessages: true,
      },
    });
    let text = "";
    let final: string | undefined;
    try {
      for await (const message of session) {
        if (
          message.type === "stream_event" &&
          message.event.type === "content_block_delta" &&
          message.event.delta.type === "text_delta"
        ) {
          text += message.event.delta.text;
          if (text.length > MAX_TEXT_LENGTH)
            throw new Error("Claude returned too much text.");
          request.onText(text);
        }
        if (message.type === "result") {
          final = completedClaudeResult(message);
        }
      }
      if (request.signal.aborted) throw new Error("Generation cancelled.");
      if (final === undefined || !final.trim())
        throw new Error(
          "Claude returned no completed text. Check your Claude Code login and usage limits.",
        );
      if (final.length > MAX_TEXT_LENGTH)
        throw new Error("Claude returned too much text.");
      request.onText(final);
      return final;
    } catch (error) {
      if (timedOut)
        throw new Error(
          "Claude timed out. Check your connection and try again.",
        );
      if (request.signal.aborted) throw new Error("Generation cancelled.");
      throw error;
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", abort);
      session.close();
    }
  });
}
