import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_SYSTEM_PROMPT,
  MAX_TEXT_LENGTH,
  type ModelInfo,
  type RunRequest,
} from "../core/types";
import { inTemporaryDirectory, parseJsonLine, runProcess } from "./process";
import { RpcProcess } from "./rpc";

export const GROK_TEXT_FLAGS = [
  "--tools",
  "",
  "--deny",
  "*",
  "--permission-mode",
  "dontAsk",
  "--disable-web-search",
  "--no-subagents",
  "--no-plan",
];

function selectOptions(value: unknown): { value: string; name: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    if (option && Array.isArray(option.options))
      return selectOptions(option.options);
    return option && typeof option.value === "string"
      ? [{ value: option.value, name: option.name ?? option.value }]
      : [];
  });
}

export function modelsFromGrokSession(
  session: Record<string, any>,
): ModelInfo[] {
  const configs: any[] = Array.isArray(session.configOptions)
    ? session.configOptions
    : [];
  const modelConfig = configs.find(
    (entry) => entry.category === "model" || entry.id === "model",
  );
  const effortConfig = configs.find(
    (entry) =>
      entry.category === "thought_level" ||
      /effort|thinking|thought/i.test(entry.id ?? ""),
  );
  const efforts = selectOptions(effortConfig?.options).map(
    (option) => option.value,
  );
  const options = selectOptions(modelConfig?.options);
  if (options.length)
    return options.map((option) => ({
      id: option.value,
      name: option.name,
      efforts,
      isDefault: option.value === modelConfig.currentValue,
      defaultEffort: effortConfig?.currentValue,
    }));
  return (session.models?.availableModels ?? []).flatMap((model: any) => {
    if (typeof model.modelId !== "string") return [];
    const metadata = model._meta;
    const modelEfforts = Array.isArray(metadata?.reasoningEfforts)
      ? metadata.reasoningEfforts
          .map((entry: any) => entry.value ?? entry.id)
          .filter((value: unknown) => typeof value === "string")
      : efforts;
    return [
      {
        id: model.modelId,
        name: model.name ?? model.modelId,
        description: model.description,
        efforts: modelEfforts,
        isDefault: model.modelId === session.models.currentModelId,
        defaultEffort: metadata?.reasoningEffort ?? effortConfig?.currentValue,
      },
    ];
  });
}

export async function grokModels(
  executable: string,
  signal?: AbortSignal,
): Promise<ModelInfo[]> {
  return inTemporaryDirectory(async (cwd) => {
    const rpc = new RpcProcess(
      executable,
      [...GROK_TEXT_FLAGS, "agent", "stdio"],
      cwd,
      signal,
    );
    try {
      const init = await rpc.request("initialize", {
        protocolVersion: 1,
        clientInfo: { name: "vicinae-ai-commands", version: "0.1.0" },
        clientCapabilities: {},
      });
      // Like T3 Code's probe, catalog discovery only initializes ACP. It must
      // not start a session, run startup hooks, or open an authentication flow.
      const models = modelsFromGrokSession({ models: init._meta?.modelState });
      if (!models.length)
        throw new Error(
          "This Grok CLI does not expose a model catalog over ACP. Update Grok, then refresh.",
        );
      return models;
    } finally {
      await rpc.close();
    }
  });
}

export class GrokOutput {
  text = "";
  complete = false;
  constructor(private readonly onText: (text: string) => void) {}
  accept(message: Record<string, any>): void {
    if (
      message.type === "stream_event" &&
      message.event?.type === "content_block_delta" &&
      message.event.delta?.type === "text_delta"
    ) {
      this.text += message.event.delta.text;
      if (this.text.length > MAX_TEXT_LENGTH)
        throw new Error("Grok returned too much text.");
      this.onText(this.text);
    }
    if (message.type === "assistant") {
      const blocks = message.message?.content;
      if (Array.isArray(blocks)) {
        if (blocks.some((block: any) => block.type === "tool_use"))
          throw new Error(
            "Grok attempted to use a tool during a text transformation. The run was stopped.",
          );
        const text = blocks
          .filter((block: any) => block.type === "text")
          .map((block: any) => block.text)
          .join("");
        if (text) {
          this.text = text;
          this.onText(text);
        }
      }
    }
    if (message.type === "result") {
      if (
        message.is_error ||
        (message.subtype && message.subtype !== "success")
      )
        throw new Error(
          message.errors?.join("\n") ??
            message.result ??
            "Grok could not complete this request.",
        );
      if (typeof message.result === "string") this.text = message.result;
      this.complete = true;
    }
    if (message.type === "error")
      throw new Error(
        message.error?.message ??
          message.message ??
          "Grok could not complete this request.",
      );
    if (this.text.length > MAX_TEXT_LENGTH)
      throw new Error("Grok returned too much text.");
  }
  result(): string {
    if (!this.complete || !this.text.trim())
      throw new Error(
        "Grok returned no completed text. Run `grok login` in a terminal and check your usage limits.",
      );
    return this.text;
  }
}

export async function runGrok(request: RunRequest): Promise<string> {
  return inTemporaryDirectory(async (cwd) => {
    const promptPath = join(cwd, "prompt.txt");
    await writeFile(promptPath, request.prompt, { mode: 0o600 });
    const args = [
      ...GROK_TEXT_FLAGS,
      "--prompt-file",
      promptPath,
      "--verbatim",
      "--model",
      request.command.model,
      "--system-prompt-override",
      request.command.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      "--max-turns",
      "1",
      "--output-format",
      "streaming-messages-json",
      "--include-partial-messages",
    ];
    if (request.command.effort)
      args.push("--reasoning-effort", request.command.effort);
    const output = new GrokOutput(request.onText);
    await runProcess({
      executable: request.executable,
      args,
      cwd,
      signal: request.signal,
      onLine: (line) => output.accept(parseJsonLine(line)),
    });
    const text = output.result();
    request.onText(text);
    return text;
  });
}
