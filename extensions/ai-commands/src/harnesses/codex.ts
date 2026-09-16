import {
  DEFAULT_SYSTEM_PROMPT,
  MAX_TEXT_LENGTH,
  type ModelInfo,
  type RunRequest,
} from "../core/types";
import { inTemporaryDirectory, parseJsonLine, runProcess } from "./process";
import { RpcProcess } from "./rpc";

export async function codexModels(
  executable: string,
  signal?: AbortSignal,
): Promise<ModelInfo[]> {
  return inTemporaryDirectory(async (cwd) => {
    const rpc = new RpcProcess(
      executable,
      [
        "app-server",
        "--stdio",
        "-c",
        'model_provider="openai"',
        "-c",
        'openai_base_url=""',
      ],
      cwd,
      signal,
    );
    try {
      await rpc.request("initialize", {
        clientInfo: {
          name: "vicinae_ai_commands",
          title: "Vicinae AI Commands",
          version: "0.1.0",
        },
      });
      rpc.notify("initialized");
      const configured = await rpc.request("config/read", {
        includeLayers: false,
      });
      if (configured.config?.model_catalog_json)
        throw new Error(
          "Codex has a custom model_catalog_json configured. Remove that override to discover current subscription models for AI Commands.",
        );
      const models: ModelInfo[] = [];
      let cursor: string | null = null;
      const seen = new Set<string>();
      do {
        const response: any = await rpc.request("model/list", {
          limit: 100,
          includeHidden: false,
          ...(cursor ? { cursor } : {}),
        });
        if (!Array.isArray(response.data))
          throw new Error("Codex returned an invalid model catalog.");
        for (const model of response.data) {
          if (typeof model.model !== "string" || !model.model || model.hidden)
            continue;
          models.push({
            id: model.model,
            name: model.displayName ?? model.model,
            description: model.description,
            efforts: (model.supportedReasoningEfforts ?? [])
              .map((value: any) => value.reasoningEffort)
              .filter((value: unknown) => typeof value === "string"),
            defaultEffort: model.defaultReasoningEffort,
            isDefault: model.isDefault,
          });
        }
        cursor = response.nextCursor ?? null;
        if (cursor && seen.has(cursor))
          throw new Error("Codex repeated a model catalog page.");
        if (cursor) seen.add(cursor);
      } while (cursor);
      return models;
    } finally {
      await rpc.close();
    }
  });
}

export function codexArguments(command: RunRequest["command"]): string[] {
  const args = [
    "exec",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--color",
    "never",
    "--json",
    "--model",
    command.model,
  ];
  for (const feature of [
    "shell_tool",
    "plugins",
    "hooks",
    "apps",
    "multi_agent",
    "browser_use",
    "computer_use",
    "image_generation",
    "view_image",
    "workspace_dependencies",
    "code_mode",
    "code_mode_host",
    "memories",
    "skill_search",
  ])
    args.push("-c", `features.${feature}=false`);
  args.push(
    "-c",
    'web_search="disabled"',
    "-c",
    "project_doc_max_bytes=0",
    "-c",
    `developer_instructions=${JSON.stringify(command.systemPrompt || DEFAULT_SYSTEM_PROMPT)}`,
  );
  if (command.effort)
    args.push("-c", `model_reasoning_effort=${JSON.stringify(command.effort)}`);
  args.push("-");
  return args;
}

export class CodexOutput {
  text = "";
  complete = false;
  constructor(private readonly onText: (text: string) => void) {}
  accept(message: Record<string, any>): void {
    if (
      message.type === "item.completed" &&
      message.item?.type === "agent_message"
    ) {
      if (typeof message.item.text !== "string")
        throw new Error("Codex returned an invalid assistant message.");
      this.text = message.item.text;
      if (this.text.length > MAX_TEXT_LENGTH)
        throw new Error("Codex returned too much text.");
      this.onText(this.text);
    }
    if (message.type === "turn.completed") this.complete = true;
    if (message.type === "turn.failed" || message.type === "error")
      throw new Error(
        message.error?.message ??
          message.message ??
          "Codex could not complete this request.",
      );
    if (
      message.item?.type === "command_execution" ||
      message.item?.type === "mcp_tool_call"
    )
      throw new Error(
        "Codex attempted to use a tool during a text transformation. The run was stopped.",
      );
  }
  result(): string {
    if (!this.complete || !this.text.trim())
      throw new Error(
        "Codex returned no completed text. Check your Codex login and usage limits.",
      );
    return this.text;
  }
}

export async function runCodex(request: RunRequest): Promise<string> {
  return inTemporaryDirectory(async (cwd) => {
    const output = new CodexOutput(request.onText);
    await runProcess({
      executable: request.executable,
      args: codexArguments(request.command),
      cwd,
      signal: request.signal,
      input: request.prompt,
      onLine: (line) => output.accept(parseJsonLine(line)),
    });
    return output.result();
  });
}
