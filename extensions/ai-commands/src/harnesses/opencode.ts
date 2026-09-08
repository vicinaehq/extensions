import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import {
  DEFAULT_SYSTEM_PROMPT,
  MAX_TEXT_LENGTH,
  type ModelInfo,
  type RunRequest,
} from "../core/types";
import {
  cleanEnvironment,
  inTemporaryDirectory,
  runProcess,
  terminateProcess,
} from "./process";
import {
  array,
  object,
  readJson,
  requestSignal,
  type JsonObject,
} from "./http";

type OpenCodeClient = (
  path: string,
  body?: JsonObject,
  method?: string,
) => Promise<JsonObject>;

export function textOnlyConfig(source: JsonObject): JsonObject {
  // Let the CLI resolve its own JSONC, environment and file references. Carry
  // forward provider settings only; never copy global coding rules or tools.
  const providerConfig = Object.fromEntries(
    [
      "provider",
      "model",
      "small_model",
      "enabled_providers",
      "disabled_providers",
    ]
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
  return {
    ...providerConfig,
    share: "disabled",
    snapshot: false,
    agent: {
      "ai-commands": {
        mode: "primary",
        prompt: DEFAULT_SYSTEM_PROMPT,
        permission: "deny",
      },
    },
  };
}

export function validateTextOnlyConfig(config: JsonObject): void {
  const agent = object(object(config.agent)["ai-commands"]);
  const permission = object(agent.permission);
  const denied =
    agent.permission === "deny" ||
    (permission["*"] === "deny" &&
      Object.values(permission).every((value) => value === "deny"));
  if (
    array(config.instructions).length ||
    Object.values(object(config.mcp)).some(
      (value) => object(value).enabled !== false,
    ) ||
    agent.prompt !== DEFAULT_SYSTEM_PROMPT ||
    agent.mode !== "primary" ||
    !denied ||
    agent.disable === true ||
    ["steps", "maxSteps", "model", "variant", "temperature", "top_p"].some(
      (key) => agent[key] !== undefined,
    ) ||
    Object.keys(object(agent.options)).length ||
    config.share !== "disabled" ||
    config.snapshot !== false
  )
    throw new Error(
      "OpenCode has managed or global instructions, tools, or agent overrides that cannot be isolated for this text command. Use a separate provider connection or another harness.",
    );
}

async function withOpenCodeServer<T>(
  executable: string,
  signal: AbortSignal | undefined,
  run: (client: OpenCodeClient) => Promise<T>,
): Promise<T> {
  signal?.throwIfAborted();
  return inTemporaryDirectory(async (cwd) => {
    const password = randomBytes(32).toString("hex");
    const active = requestSignal(signal);
    const env: NodeJS.ProcessEnv = {
      ...cleanEnvironment(),
      OPENCODE_DB: join(cwd, "sessions.sqlite"),
      OPENCODE_DISABLE_PROJECT_CONFIG: "true",
      OPENCODE_DISABLE_AUTOUPDATE: "true",
      OPENCODE_DISABLE_CLAUDE_CODE: "true",
      OPENCODE_DISABLE_EXTERNAL_SKILLS: "true",
      OPENCODE_DISABLE_LSP_DOWNLOAD: "true",
    };
    let config: JsonObject;
    try {
      const probe = await runProcess({
        executable,
        args: ["debug", "config", "--pure"],
        cwd,
        env,
        signal: active,
        timeoutMs: 30_000,
      });
      config = textOnlyConfig(object(JSON.parse(probe.stdout)));
    } catch {
      throw new Error(
        "Could not read OpenCode provider configuration. Check OpenCode 1.18.29 or later in your terminal.",
      );
    }
    // Retain saved authentication in its normal data directory, while isolating
    // configuration and the session database. No auth files are copied.
    delete env.OPENCODE_CONFIG;
    delete env.OPENCODE_CONFIG_DIR;
    delete env.OPENCODE_CONFIG_CONTENT;
    const child = spawn(
      executable,
      ["serve", "--pure", "--hostname=127.0.0.1", "--port=0"],
      {
        cwd,
        shell: false,
        detached: process.platform !== "win32",
        stdio: "pipe",
        env: {
          ...env,
          OPENCODE_SERVER_USERNAME: "opencode",
          OPENCODE_SERVER_PASSWORD: password,
          XDG_CONFIG_HOME: join(cwd, "config"),
          OPENCODE_CONFIG_DIR: join(cwd, "config", "opencode"),
          OPENCODE_PERMISSION: JSON.stringify({ "*": "deny" }),
          OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
        },
      },
    );
    child.stdin.end();
    // Drain logs but never include them in UI errors: a provider may log secrets.
    child.stderr.resume();
    const exit = new Promise<void>((resolve) =>
      child.once("close", () => resolve()),
    );
    const kill = () => terminateProcess(child, "SIGKILL");
    process.once("exit", kill);
    active.addEventListener("abort", kill, { once: true });
    try {
      const url = await new Promise<string>((resolve, reject) => {
        let output = "";
        const fail = () =>
          reject(
            new Error(
              "OpenCode could not start. Use OpenCode 1.18.29 or later and check its executable path.",
            ),
          );
        const abort = () =>
          reject(new Error("OpenCode request cancelled or timed out."));
        const timer = setTimeout(fail, 30_000);
        const cleanup = () => {
          clearTimeout(timer);
          child.off("error", fail);
          child.off("exit", fail);
          child.stdout.off("data", data);
          active.removeEventListener("abort", abort);
        };
        const data = (chunk: Buffer) => {
          output = (output + chunk.toString("utf8")).slice(-16_000);
          const match = output.match(
            /opencode server listening on (http:\/\/127\.0\.0\.1:\d+)(?:\s|$)/,
          );
          if (match) {
            cleanup();
            resolve(match[1]!);
          }
        };
        child.stdout.on("data", data);
        child.once("error", fail);
        child.once("exit", fail);
        active.addEventListener("abort", abort, { once: true });
        if (active.aborted) abort();
        // Cleanup rejected startup listeners as well as successful ones.
        void exit.then(cleanup);
      });
      child.stdout.resume();
      const client: OpenCodeClient = async (path, body, method) => {
        active.throwIfAborted();
        const response = await fetch(url + path, {
          method: method ?? (body ? "POST" : "GET"),
          signal: active,
          redirect: "error",
          headers: {
            Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`,
            "Content-Type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(
            `OpenCode returned HTTP ${response.status}. Check its provider connection and selected model.`,
          );
        }
        return readJson(response);
      };
      const health = await client("/global/health");
      if (health.healthy !== true)
        throw new Error("OpenCode server is not healthy.");
      // Managed and ~/.opencode config can still be merged by OpenCode. Check
      // the effective config before provider/session APIs can initialize tools.
      validateTextOnlyConfig(await client("/config"));
      return await run(client);
    } finally {
      active.removeEventListener("abort", kill);
      terminateProcess(child);
      const timer = setTimeout(kill, 1000);
      await exit;
      clearTimeout(timer);
      kill();
      process.off("exit", kill);
    }
  });
}

export function openCodeCatalog(data: JsonObject): ModelInfo[] {
  if (!Array.isArray(data.all) || !Array.isArray(data.connected))
    throw new Error("OpenCode returned an unsupported provider catalog.");
  const connected = new Set(data.connected);
  const models: ModelInfo[] = [];
  for (const provider of data.all.map(object)) {
    if (typeof provider.id !== "string" || !connected.has(provider.id))
      continue;
    for (const [id, value] of Object.entries(object(provider.models))) {
      const model = object(value);
      if (object(object(model.capabilities).output).text === false) continue;
      models.push({
        id: `${provider.id}/${id}`,
        name: `${String(model.name ?? id)} · ${provider.id}`,
        efforts: Object.entries(object(model.variants))
          .filter(([, value]) => object(value).disabled !== true)
          .map(([name]) => name),
        description:
          "Uses this provider connection in OpenCode. Thinking choices are the variants published by OpenCode for this model.",
      });
    }
  }
  if (!models.length)
    throw new Error(
      "No connected text models in OpenCode. Connect a provider in OpenCode, then refresh.",
    );
  return models;
}

export async function openCodeModels(
  executable: string,
  signal?: AbortSignal,
): Promise<ModelInfo[]> {
  return withOpenCodeServer(executable, signal, async (client) =>
    openCodeCatalog(await client("/provider")),
  );
}

export function openCodeResult(result: JsonObject): string {
  const info = object(result.info);
  if (info.error) {
    const name = object(info.error).name;
    throw new Error(
      `OpenCode generation failed${typeof name === "string" && /^[A-Za-z]+Error$/.test(name) ? ` (${name})` : ""}. Check the provider login, balance, and model settings.`,
    );
  }
  if (
    info.role !== "assistant" ||
    info.finish !== "stop" ||
    !object(info.time).completed
  )
    throw new Error(
      "OpenCode did not finish the answer. Partial output will not be pasted.",
    );
  if (array(result.parts).some((part) => object(part).type === "tool"))
    throw new Error(
      "OpenCode attempted a tool request. This extension only transforms text.",
    );
  const text = array(result.parts)
    .map(object)
    .filter((part) => part.type === "text" && part.ignored !== true)
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("");
  if (!text.trim()) throw new Error("OpenCode returned no text.");
  if (text.length > MAX_TEXT_LENGTH)
    throw new Error("The OpenCode result is too large.");
  return text;
}

export async function runOpenCode(request: RunRequest): Promise<string> {
  return withOpenCodeServer(
    request.executable,
    request.signal,
    async (client) => {
      const models = openCodeCatalog(await client("/provider"));
      const model = models.find((model) => model.id === request.command.model);
      if (
        !model ||
        (request.command.effort &&
          !model.efforts.includes(request.command.effort))
      )
        throw new Error(
          "The OpenCode model or thinking variant is no longer available. Edit the command and refresh models.",
        );
      const session = await client("/session", {
        title: "AI Commands",
        permission: [{ permission: "*", pattern: "*", action: "deny" }],
      });
      if (
        typeof session.id !== "string" ||
        !/^ses[a-zA-Z0-9_-]+$/.test(session.id)
      )
        throw new Error("OpenCode did not create a session.");
      const split = model.id.indexOf("/");
      const response = await client(`/session/${session.id}/message`, {
        model: {
          providerID: model.id.slice(0, split),
          modelID: model.id.slice(split + 1),
        },
        agent: "ai-commands",
        system: request.command.systemPrompt,
        ...(request.command.effort ? { variant: request.command.effort } : {}),
        parts: [{ type: "text", text: request.prompt }],
      });
      const text = openCodeResult(response);
      request.signal.throwIfAborted();
      request.onText(text);
      return text;
    },
  );
}
